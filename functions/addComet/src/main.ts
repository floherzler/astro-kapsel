import * as sdk from "npm:node-appwrite";
const { Client, TablesDB, ID, Query } = sdk;

type Body = {
    cometID?: string; // e.g. "1P" or "1P/Halley"
};

function ok(res: any, data: unknown, status = 200) {
    return res.json(data, status);
}
function fail(res: any, msg: string, status = 400, extra: Record<string, unknown> = {}) {
    return res.json({ success: false, error: msg, ...extra }, status);
}

export default async ({ req, res, log, error }: any) => {
    try {
        // --- Parse body ---
        let body: Body = {};

        try {
            // First try standard JSON parse
            body = await req.json();
            log(`[addComet] Parsed JSON body keys: ${Object.keys(body).join(',')}`);
        } catch {
            log("[addComet] req.json() failed, trying fallback...");

            // Fallback 1: bodyText (Appwrite Functions v7)
            if (typeof req.bodyText === 'string' && req.bodyText.length > 0) {
                try {
                    body = JSON.parse(req.bodyText);
                    log(`[addComet] Parsed bodyText JSON keys: ${Object.keys(body).join(',')}`);
                } catch {
                    log("[addComet] bodyText is not valid JSON");
                }
            }

            // Fallback 2: payload/raw (legacy or console test)
            else if (typeof req.payload === 'string' && req.payload.length > 0) {
                try {
                    body = JSON.parse(req.payload);
                    log(`[addComet] Parsed payload JSON keys: ${Object.keys(body).join(',')}`);
                } catch {
                    log("[addComet] payload is not valid JSON");
                }
            }
        }

        // Check cometID
        if (!body?.cometID) {
            return fail(res, "Missing required field: cometID");
        }

        const cometID = body.cometID.trim();
        log(`[addComet] Fetching data for comet ${cometID} ☄️`);

        // --- NASA API call ---
        const nasaUrl = `https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=${encodeURIComponent(cometID)}`;
        let nasaData: any;
        try {
            const response = await fetch(nasaUrl);
            if (!response.ok) {
                return fail(res, `NASA API returned ${response.status}`, response.status, {
                    details: await response.text(),
                });
            }
            nasaData = await response.json();
        } catch (err) {
            log(`[addComet] Error contacting NASA API: ${err}`);
            return fail(res, "Failed to fetch NASA SBDB data", 502);
        }

        if (!nasaData?.object?.fullname) {
            return fail(res, "Invalid or empty response from NASA API", 404);
        }

        // --- Extract summary ---
        const summary = {
            name: nasaData.object.fullname,
            designation: nasaData.object.des,
            orbitClass: nasaData.object.orbit_class?.name,
            perihelion: nasaData.orbit?.elements?.find((el: any) => el.name === "q")?.value,
            eccentricity: nasaData.orbit?.elements?.find((el: any) => el.name === "e")?.value,
            period_days: nasaData.orbit?.elements?.find((el: any) => el.name === "per")?.value,
            source: nasaData.signature?.source ?? "NASA/JPL SBDB",
            createdAt: new Date().toISOString(),
        };

        // --- Connect to Appwrite ---
        const endpoint = Deno.env.get("APPWRITE_FUNCTION_API_ENDPOINT") ?? "";
        const projectId = Deno.env.get("APPWRITE_FUNCTION_PROJECT_ID") ?? "";
        const apiKey =
            req.headers["x-appwrite-key"] ??
            Deno.env.get("APPWRITE_API_KEY") ??
            "";

        const client = new Client()
            .setEndpoint(endpoint)
            .setProject(projectId)
            .setKey(apiKey);

        const tablesDB = new TablesDB(client);

        const databaseId = Deno.env.get("APPWRITE_DATABASE_ID") ?? "astroDB";
        const cometsTableId = Deno.env.get("APPWRITE_TABLE_COMETS") ?? "comets";

        // --- Prevent duplicates ---
        try {
            const existing = await tablesDB.listRows({
                databaseId,
                tableId: cometsTableId,
                queries: [
                    Query.equal("designation", summary.designation)
                ]
            });

            if (existing.total > 0) {
                log(`[addComet] Comet ${summary.designation} already exists`);
                return ok(res, {
                    success: true,
                    message: `Comet ${summary.name} already exists`,
                    comet: existing.rows[0],
                });
            }
        } catch (checkErr) {
            log(`[addComet] Warning: could not check for duplicates (${checkErr})`);
        }

        // --- Insert into Appwrite ---
        let newRow;
        try {
            newRow = await tablesDB.createRow({
                databaseId,
                tableId: cometsTableId,
                rowId: ID.unique(),
                data: summary,
            });
        } catch (insertErr) {
            log(`[addComet] Failed to insert comet into Appwrite: ${insertErr}`);
            return fail(res, "Database insert failed", 500);
        }

        log(`[addComet] Successfully added comet ${summary.name} to Appwrite ✅`);

        return ok(res, {
            success: true,
            message: `☄️ Comet ${summary.name} added successfully!`,
            comet: newRow,
        }, 201);
    } catch (e: any) {
        const msg = String(e?.message ?? e);
        error(`[addComet] Uncaught error 🚨: ${msg}`);
        return fail(res, "Internal server error", 500, { details: msg });
    }
};
