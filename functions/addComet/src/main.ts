import {
    Client,
    TablesDB,
    ID,
} from "https://deno.land/x/appwrite@7.0.0/mod.ts";

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
        // --- Auth check ---
        const callerId: string | undefined =
            req.headers["x-appwrite-user-id"] ?? req.headers["X-Appwrite-User-Id"];
        if (!callerId) return fail(res, "Unauthenticated: missing x-appwrite-user-id header", 401);

        // --- Parse body ---
        let body: Body = {};
        try {
            body = await req.json();
        } catch {
            log("[addComet] No JSON body provided");
        }

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

        const databaseId = Deno.env.get("APPWRITE_DATABASE_ID") ?? "";
        const cometsTableId = Deno.env.get("APPWRITE_TABLE_COMETS") ?? "comets";

        // --- Prevent duplicates ---
        try {
            const existing = await tablesDB.listDocuments({
                databaseId,
                tableId: cometsTableId,
                queries: [`equal("designation", "${summary.designation}")`],
            });
            if (existing.total > 0) {
                log(`[addComet] Comet ${summary.designation} already exists`);
                return ok(res, {
                    success: true,
                    message: `Comet ${summary.name} already exists`,
                    comet: existing.documents[0],
                });
            }
        } catch (checkErr) {
            log(`[addComet] Warning: could not check for duplicates (${checkErr})`);
        }

        // --- Insert into Appwrite ---
        let newDoc;
        try {
            newDoc = await tablesDB.createDocument({
                databaseId,
                tableId: cometsTableId,
                documentId: ID.unique(),
                data: summary,
            });
        } catch (insertErr) {
            log(`[addComet] Failed to insert comet into Appwrite: ${insertErr}`);
            return fail(res, "Database insert failed", 500);
        }

        log(`[addComet] Successfully added comet ${summary.name} to Appwrite ✅`);

        return ok(res, {
            success: true,
            message: `Comet ${summary.name} added successfully!`,
            comet: newDoc,
        }, 201);
    } catch (e: any) {
        const msg = String(e?.message ?? e);
        error(`[addComet] Uncaught error 🚨: ${msg}`);
        return fail(res, "Internal server error", 500, { details: msg });
    }
};
