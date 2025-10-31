// addComet.ts (Deno / Appwrite Functions v7+)
import { Client, TablesDB, ID, Query } from "npm:node-appwrite";

type Body = { cometID?: string };

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

// ---- Robust body parser that works across Appwrite runtimes ----
async function parseBody(req: any, log: (s: string) => void): Promise<Body> {
    // 1) Appwrite v7 (preferred)
    if (req?.bodyJson && typeof req.bodyJson === "object") {
        log("[addComet] using req.bodyJson");
        return req.bodyJson as Body;
    }
    if (typeof req?.bodyText === "string" && req.bodyText.length > 0) {
        log("[addComet] parsing req.bodyText");
        try { return JSON.parse(req.bodyText) as Body; } catch { /* ignore */ }
    }
    // 2) Legacy fallbacks sometimes present
    if (typeof req?.payload === "string" && req.payload.length > 0) {
        log("[addComet] parsing req.payload");
        try { return JSON.parse(req.payload) as Body; } catch { /* ignore */ }
    }
    // 3) Some gateways pass JSON in req.body
    if (typeof req?.body === "string" && req.body.length > 0) {
        log("[addComet] parsing req.body");
        try { return JSON.parse(req.body) as Body; } catch { /* ignore */ }
    }
    // 4) Query param fallback (?cometID=1P)
    try {
        const url = req?.url ?? req?.headers?.["x-original-url"];
        if (typeof url === "string") {
            const q = new URL(url).searchParams.get("cometID");
            if (q) return { cometID: q };
        }
    } catch { /* ignore */ }

    // 5) Nothing found
    log("[addComet] no JSON body found");
    return {};
}

/** Hybrid classification using prefix (naming) + orbit_class.code (dynamical class) */
function classifyComet(nasaObj: any) {
    const prefix = (nasaObj?.prefix ?? "").toString().toUpperCase() || null;
    const orbitCode = (nasaObj?.orbit_class?.code ?? "").toString().toUpperCase() || null;

    // Prefix overrides
    if (prefix === "D") return { prefix, status: "lost", is_viable: false };
    if (prefix === "X") return { prefix, status: "unreliable", is_viable: false };
    if (prefix === "A") return { prefix, status: "asteroid", is_viable: false };
    if (prefix === "I") return { prefix, status: "interstellar", is_viable: false };

    // Dynamical class
    switch (orbitCode) {
        case "JFC": return { prefix, status: "periodic", is_viable: true };     // Jupiter-family
        case "HTC": return { prefix, status: "periodic", is_viable: true };     // Halley-type
        case "LPC": return { prefix, status: "long-period", is_viable: true };  // Long-period
        case "HYP": return { prefix, status: "hyperbolic", is_viable: false };  // Non-returning
        case "MBA":
        case "AST": return { prefix, status: "asteroid", is_viable: false };
        default: return { prefix, status: "unknown", is_viable: false };
    }
}

export default async ({ req, res, log, error }: any) => {
    try {
        // --- Parse input safely ---
        const body = await parseBody(req, log);
        if (!body?.cometID || typeof body.cometID !== "string") {
            return res.json({ success: false, error: "Missing required field: cometID" }, 400);
        }
        const cometID = body.cometID.trim();
        log(`☄️ addComet: fetching "${cometID}"`);

        // --- Fetch from NASA SBDB ---
        const nasaUrl = `https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=${encodeURIComponent(cometID)}`;
        const response = await fetch(nasaUrl);
        const raw = await response.text();
        let nasaData: any;
        try { nasaData = JSON.parse(raw); }
        catch {
            log(`[addComet] NASA response could not be parsed for "${cometID}"`);
            return res.json({ success: false, error: "Invalid NASA response", details: raw }, 502);
        }
        log(`[addComet] NASA status ${response.status} ${response.statusText}`);

        // Multiple candidates (HTTP 300 or 200 with list but no object)
        if ((response.status === 300 || (nasaData?.list && !nasaData?.object)) && Array.isArray(nasaData.list)) {
            return res.json({
                success: false,
                reason: "multiple_matches",
                message: `Multiple matches found for "${cometID}".`,
                suggestions: nasaData.list.map((e: any) => ({
                    designation: e?.pdes ?? null,
                    name: e?.name ?? null,
                    suggestion_label: e?.name && e?.pdes ? `${e.name} (${e.pdes})` :
                        e?.name ? e.name :
                            e?.pdes ?? "Unknown object"
                }))
            }, 409);
        }

        if (!response.ok || !nasaData?.object?.fullname) {
            const message = extractNasaMessage(nasaData) ?? `Specified object not found (${cometID})`;
            log(`[addComet] NASA lookup failed: ${message}`);
            return res.json({
                success: false,
                error: message,
                details: nasaData
            }, response.status === 200 ? 404 : response.status || 404);
        }

        // --- Extract orbital elements ---
        const els = nasaData.orbit?.elements ?? [];
        const get = (n: string) => els.find((e: any) => e?.name === n)?.value ?? null;
        const f = (n: string) => (get(n) !== null ? parseFloat(get(n)) : null);

        // Classification
        const cls = classifyComet(nasaData.object);

        const summary = {
            name: nasaData.object.fullname ?? null,
            designation: nasaData.object.des ?? null,

            // NEW: names + flags for UI
            prefix: cls.prefix,                                  // 'P','C','D','X','A','I' (from JPL)
            comet_status: cls.status,                            // 'periodic','long-period','hyperbolic','lost','asteroid','interstellar','unreliable','unknown'
            is_viable: cls.is_viable,                            // true for P/C with JFC/HTC/LPC

            orbit_class: nasaData.object.orbit_class?.name ?? null,
            orbit_class_code: nasaData.object.orbit_class?.code ?? null,

            eccentricity: f("e"),
            semi_major_axis: f("a"),
            perihelion_distance: f("q"),
            period_years: f("per") ? f("per")! / 365.25 : null,
            last_perihelion_year: f("tp"),                       // JD (TDB)
            inclination_deg: f("i"),
            ascending_node_deg: f("om"),
            arg_periapsis_deg: f("w"),
            source: nasaData.signature?.source ?? "NASA/JPL SBDB",
        };

        // --- Appwrite client ---
        const client = new Client()
            .setEndpoint(Deno.env.get("APPWRITE_FUNCTION_API_ENDPOINT")!)
            .setProject(Deno.env.get("APPWRITE_FUNCTION_PROJECT_ID")!);

        const apiKey =
            req.headers?.["x-appwrite-key"] ??
            Deno.env.get("APPWRITE_API_KEY") ??
            Deno.env.get("APPWRITE_FUNCTION_API_KEY"); // extra fallback

        if (apiKey) client.setKey(String(apiKey));

        const tablesDB = new TablesDB(client);
        const databaseId = Deno.env.get("APPWRITE_DATABASE_ID")! ?? "astroDB";
        const cometsTable = Deno.env.get("APPWRITE_TABLE_COMETS") ?? "comets";
        const flybysTable = Deno.env.get("APPWRITE_TABLE_FLYBYS") ?? "flybys";

        // --- De-dup by designation ---
        const existing = await tablesDB.listRows({
            databaseId,
            tableId: cometsTable,
            queries: [Query.equal("designation", summary.designation ?? "__none__")],
        });
        if (existing.total > 0) {
            return res.json({ success: true, message: "Comet already exists", comet: existing.rows[0] }, 200);
        }

        // --- Insert comet row ---
        const cometRow = await tablesDB.createRow({
            databaseId,
            tableId: cometsTable,
            rowId: ID.unique(),
            data: summary,
        });

        // --- Generate flybys only for viable returning comets (JFC/HTC/LPC) ---
        const e = summary.eccentricity ?? NaN;
        const canRepeat = summary.is_viable && Number.isFinite(e) && e < 1;

        if (canRepeat && summary.period_years && summary.last_perihelion_year) {
            const jdToYear = (jd: number) => 2000 + (jd - 2451545.0) / 365.25;
            const lastYear = jdToYear(summary.last_perihelion_year);
            const period = summary.period_years;

            // 5 past + next one
            for (let n = -5; n <= 1; n++) {
                await tablesDB.createRow({
                    databaseId,
                    tableId: flybysTable,
                    rowId: ID.unique(),
                    data: {
                        comet: cometRow.$id,
                        year: lastYear + n * period,
                        flagged: false,
                    },
                });
            }
        }

        log(`[addComet] inserted comet ${cometRow.$id}`);
        return res.json({ success: true, comet: cometRow }, 201);

    } catch (e: any) {
        error(`[addComet] ${e?.message || e}`);
        return res.json({ success: false, error: "Internal server error", details: String(e?.message || e) }, 500);
    }
};
