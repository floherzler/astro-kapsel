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

/**
 * Hybrid classification using both prefix (naming) + orbit_class.code (dynamic orbit type)
 */
function classifyComet(nasaObj: any) {
    const prefix = nasaObj?.prefix?.toUpperCase() ?? null;
    const orbitCode = nasaObj?.orbit_class?.code?.toUpperCase() ?? null;

    // Prefix overrides (naming meaning)
    if (prefix === "D") return { prefix, status: "lost", is_viable: false };
    if (prefix === "X") return { prefix, status: "unreliable", is_viable: false };
    if (prefix === "A") return { prefix, status: "asteroid", is_viable: false };
    if (prefix === "I") return { prefix, status: "interstellar", is_viable: false };

    // Physical orbit type classification
    switch (orbitCode) {
        case "JFC": return { prefix, status: "periodic", is_viable: true };     // Jupiter-family comet
        case "HTC": return { prefix, status: "periodic", is_viable: true };     // Halley-type comet
        case "LPC": return { prefix, status: "long-period", is_viable: true };  // Long-period comet
        case "HYP": return { prefix, status: "hyperbolic", is_viable: false };  // Non-returning
        case "MBA":
        case "AST": return { prefix, status: "asteroid", is_viable: false };
        default: return { prefix, status: "unknown", is_viable: false };
    }
}

export default async ({ req, res, log, error }: any) => {
    try {
        // --- Parse input ---
        const body: Body = await req.json().catch(() => ({}));
        if (!body?.cometID) return res.json({ error: "Missing cometID" }, 400);
        const cometID = body.cometID.trim();
        log(`☄️ Fetching ${cometID}`);

        // --- Fetch from NASA SBDB ---
        const nasaUrl = `https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=${encodeURIComponent(cometID)}`;
        const response = await fetch(nasaUrl);
        const raw = await response.text();
        const nasaData = JSON.parse(raw);

        if (!response.ok || !nasaData?.object?.fullname) {
            return res.json({ error: extractNasaMessage(nasaData) ?? "Not found" }, 404);
        }

        // Extract orbital elements
        const els = nasaData.orbit?.elements ?? [];
        const val = (n: string) => parseFloat(els.find((e: any) => e.name === n)?.value ?? null);

        // Hybrid classification
        const cls = classifyComet(nasaData.object);

        const summary = {
            name: nasaData.object.fullname,
            designation: nasaData.object.des,
            prefix: cls.prefix,
            comet_status: cls.status,
            is_viable: cls.is_viable,
            orbit_class: nasaData.object.orbit_class?.name ?? null,
            orbit_class_code: nasaData.object.orbit_class?.code ?? null,
            eccentricity: val("e") || null,
            semi_major_axis: val("a") || null,
            perihelion_distance: val("q") || null,
            period_years: val("per") ? val("per") / 365.25 : null,
            last_perihelion_year: val("tp") || null,
            inclination_deg: val("i") || null,
            ascending_node_deg: val("om") || null,
            arg_periapsis_deg: val("w") || null,
            source: nasaData.signature?.source ?? "NASA/JPL SBDB",
        };

        // --- Appwrite setup ---
        const client = new Client()
            .setEndpoint(Deno.env.get("APPWRITE_FUNCTION_API_ENDPOINT")!)
            .setProject(Deno.env.get("APPWRITE_FUNCTION_PROJECT_ID")!)
            .setKey(req.headers["x-appwrite-key"] ?? Deno.env.get("APPWRITE_API_KEY")!);

        const tablesDB = new TablesDB(client);
        const databaseId = Deno.env.get("APPWRITE_DATABASE_ID")!;
        const comets = Deno.env.get("APPWRITE_TABLE_COMETS")!;
        const flybys = Deno.env.get("APPWRITE_TABLE_FLYBYS")!;

        // Prevent duplicates
        const existing = await tablesDB.listRows({
            databaseId,
            tableId: comets,
            queries: [Query.equal("designation", summary.designation)],
        });
        if (existing.total > 0) return res.json({ message: "Already exists", comet: existing.rows[0] });

        // Insert comet
        const newRow = await tablesDB.createRow({
            databaseId,
            tableId: comets,
            rowId: ID.unique(),
            data: summary,
        });

        // Generate flybys only for viable repeat comets
        if (summary.is_viable && summary.period_years && summary.last_perihelion_year) {
            const jdToYear = (jd: number) => 2000 + (jd - 2451545.0) / 365.25;
            const lastYear = jdToYear(summary.last_perihelion_year);
            const period = summary.period_years;

            const entries = [];
            for (let n = -5; n <= 1; n++) {
                entries.push({
                    comet: newRow.$id,
                    year: lastYear + n * period,
                    flagged: false,
                });
            }

            for (const f of entries) {
                await tablesDB.createRow({
                    databaseId,
                    tableId: flybys,
                    rowId: ID.unique(),
                    data: f,
                });
            }
        }

        return res.json({ success: true, comet: newRow }, 201);

    } catch (e: any) {
        error(e);
        return res.json({ error: "Internal server error", details: e?.message }, 500);
    }
};
