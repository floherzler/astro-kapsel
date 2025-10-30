import { Client, TablesDB, Query } from "npm:node-appwrite";

type AppwriteContext = {
    req: any;
    res: any;
    log: (message: string) => void;
    error: (message: string) => void;
};

type NasaResult =
    | { status: "ok"; data: any }
    | { status: "multiple"; message: string; suggestions: any[] }
    | { status: "error"; message: string; details?: any; httpStatus?: number };

function extractNasaMessage(payload: any): string | null {
    if (!payload) return null;
    const { message, error } = payload;
    if (typeof message === "string") return message;
    if (message?.message) return message.message;
    if (message?.description) return message.description;
    if (Array.isArray(message)) return message.filter((m) => typeof m === "string").join(" ");
    if (typeof error === "string") return error;
    if (error?.message) return error.message;
    return null;
}

function classifyComet(nasaObj: any) {
    const prefix = (nasaObj?.prefix ?? "").toString().toUpperCase() || null;
    const orbitCode = (nasaObj?.orbit_class?.code ?? "").toString().toUpperCase() || null;

    if (prefix === "D") return { prefix, status: "lost", is_viable: false };
    if (prefix === "X") return { prefix, status: "unreliable", is_viable: false };
    if (prefix === "A") return { prefix, status: "asteroid", is_viable: false };
    if (prefix === "I") return { prefix, status: "interstellar", is_viable: false };

    switch (orbitCode) {
        case "JFC": return { prefix, status: "periodic", is_viable: true };
        case "HTC": return { prefix, status: "periodic", is_viable: true };
        case "LPC": return { prefix, status: "long-period", is_viable: true };
        case "HYP": return { prefix, status: "hyperbolic", is_viable: false };
        case "MBA":
        case "AST": return { prefix, status: "asteroid", is_viable: false };
        default: return { prefix, status: "unknown", is_viable: false };
    }
}

function buildSummary(nasaData: any) {
    const els = nasaData.orbit?.elements ?? [];
    const get = (n: string) => els.find((e: any) => e?.name === n)?.value ?? null;
    const f = (n: string) => (get(n) !== null ? parseFloat(get(n)) : null);
    const cls = classifyComet(nasaData.object);

    return {
        name: nasaData.object.fullname ?? null,
        designation: nasaData.object.des ?? null,

        prefix: cls.prefix,
        comet_status: cls.status,
        is_viable: cls.is_viable,

        orbit_class: nasaData.object.orbit_class?.name ?? null,
        orbit_class_code: nasaData.object.orbit_class?.code ?? null,

        eccentricity: f("e"),
        semi_major_axis: f("a"),
        perihelion_distance: f("q"),
        period_years: f("per") ? f("per")! / 365.25 : null,
        last_perihelion_year: f("tp"),
        inclination_deg: f("i"),
        ascending_node_deg: f("om"),
        arg_periapsis_deg: f("w"),
        source: nasaData.signature?.source ?? "NASA/JPL SBDB",
    };
}

async function fetchFromNasa(identifier: string): Promise<NasaResult> {
    const nasaUrl = `https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=${encodeURIComponent(identifier)}`;
    const response = await fetch(nasaUrl);
    const raw = await response.text();

    let nasaData: any;
    try {
        nasaData = JSON.parse(raw);
    } catch {
        return { status: "error", message: "Invalid NASA response", details: raw, httpStatus: response.status || 500 };
    }

    if ((response.status === 300 || (nasaData?.list && !nasaData?.object)) && Array.isArray(nasaData.list)) {
        return {
            status: "multiple",
            message: `Multiple matches found for "${identifier}"`,
            suggestions: nasaData.list,
        };
    }

    if (!response.ok || !nasaData?.object?.fullname) {
        return {
            status: "error",
            message: extractNasaMessage(nasaData) ?? `Not found for "${identifier}"`,
            details: nasaData,
            httpStatus: response.status || 404,
        };
    }

    return { status: "ok", data: nasaData };
}

async function refreshCometRow(tablesDB: TablesDB, databaseId: string, tableId: string, row: any, log: (s: string) => void) {
    const candidates: string[] = [];
    const pushCandidate = (value: unknown) => {
        if (!value) return;
        const text = String(value).trim();
        if (text.length === 0) return;
        if (!candidates.includes(text)) candidates.push(text);
    };

    pushCandidate(row.designation);
    pushCandidate(row.name);
    pushCandidate(row.fullname);
    pushCandidate(row.$id);

    let lastError: string | null = null;
    for (const identifier of candidates) {
        log(`[updateComets] refreshing ${identifier} (row ${row.$id})`);
        const result = await fetchFromNasa(identifier);

        if (result.status === "multiple") {
            lastError = `${result.message}`;
            continue;
        }

        if (result.status === "error") {
            lastError = result.message;
            continue;
        }

        const summary = buildSummary(result.data);
        await tablesDB.updateRow({
            databaseId,
            tableId,
            rowId: row.$id,
            data: summary,
        });
        return { success: true, identifier };
    }

    return { success: false, reason: lastError ?? "No valid identifier" };
}

export default async ({ req, res, log, error }: AppwriteContext) => {
    try {
        const client = new Client()
            .setEndpoint(Deno.env.get("APPWRITE_FUNCTION_API_ENDPOINT")!)
            .setProject(Deno.env.get("APPWRITE_FUNCTION_PROJECT_ID")!);

        const apiKey =
            req.headers?.["x-appwrite-key"] ??
            Deno.env.get("APPWRITE_API_KEY") ??
            Deno.env.get("APPWRITE_FUNCTION_API_KEY");

        if (apiKey) client.setKey(String(apiKey));

        const tablesDB = new TablesDB(client);
        const databaseId = Deno.env.get("APPWRITE_DATABASE_ID")! ?? "astroDB";
        const cometsTable = Deno.env.get("APPWRITE_TABLE_COMETS") ?? "comets";

        const limit = 100;
        let cursor: string | null = null;
        let processed = 0;
        let updated = 0;
        const failures: Array<{ rowId: string; reason: string }> = [];

        // Iterate through all rows using cursor pagination
        while (true) {
            const queries = [Query.limit(limit)];
            if (cursor) queries.push(Query.cursorAfter(cursor));

            const page = await tablesDB.listRows({
                databaseId,
                tableId: cometsTable,
                queries,
            });

            if (!page.rows.length) break;

            for (const row of page.rows) {
                processed++;
                try {
                    const result = await refreshCometRow(tablesDB, databaseId, cometsTable, row, log);
                    if (result.success) {
                        updated++;
                    } else {
                        failures.push({ rowId: row.$id, reason: result.reason ?? "Unknown error" });
                    }
                } catch (refreshError) {
                    const reason = refreshError instanceof Error ? refreshError.message : String(refreshError);
                    failures.push({ rowId: row.$id, reason });
                    error(`[updateComets] Failed to refresh row ${row.$id}: ${reason}`);
                }
            }

            if (page.rows.length < limit) break;
            cursor = page.rows[page.rows.length - 1].$id;
        }

        return res.json({
            success: true,
            processed,
            updated,
            failures,
        });
    } catch (e: any) {
        error(`[updateComets] ${e?.message || e}`);
        return res.json({ success: false, error: "Internal server error", details: String(e?.message || e) }, 500);
    }
};
