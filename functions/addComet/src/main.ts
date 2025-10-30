import { Client, TablesDB, ID, Query } from "npm:node-appwrite";

type Body = {
    cometID?: string; // e.g. "1P" or "1P/Halley"
};

function extractNasaMessage(payload: any): string | null {
    if (!payload) return null;
    const { message, error } = payload;
    if (typeof message === "string") return message;
    if (message && typeof message === "object") {
        if (typeof message.message === "string") return message.message;
        if (typeof message.description === "string") return message.description;
        if (Array.isArray(message)) {
            const merged = message.filter((m) => typeof m === "string").join(" ").trim();
            if (merged) return merged;
        }
    }
    if (typeof error === "string") return error;
    if (error && typeof error === "object" && typeof error.message === "string") {
        return error.message;
    }
    return null;
}

function ok(res: any, data: unknown, status = 200) {
    return res.json(data, status);
}
function fail(res: any, msg: string, status = 400, extra: Record<string, unknown> = {}) {
    return res.json({ success: false, error: msg, ...extra }, status);
}

function buildCandidateMessage(cometID: string, list: any[]) {
    const names = Array.isArray(list)
        ? list
              .map((entry: any) => {
                  const pdes = typeof entry?.pdes === "string" ? entry.pdes : null;
                  const name = typeof entry?.name === "string" ? entry.name : null;
                  if (pdes && name) return `${name} (${pdes})`;
                  return pdes ?? name ?? null;
              })
              .filter(Boolean)
        : [];
    const joined = names.join(", ");
    const message =
        joined.length > 0
            ? `Multiple matches found for "${cometID}". Candidates: ${joined}`
            : `Multiple matches found for "${cometID}". Please refine your query.`;
    return { message, names };
}

export default async ({ req, res, log, error }: any) => {
    try {
        // --- Parse body ---
        let body: Body = {};
        try {
            body = await req.json();
            log(`[addComet] Parsed JSON body keys: ${Object.keys(body).join(",")}`);
        } catch {
            log("[addComet] req.json() failed, trying fallback...");
            if (typeof req.bodyText === "string" && req.bodyText.length > 0) {
                try {
                    body = JSON.parse(req.bodyText);
                    log(`[addComet] Parsed bodyText JSON keys: ${Object.keys(body).join(",")}`);
                } catch {
                    log("[addComet] bodyText is not valid JSON");
                }
            } else if (typeof req.payload === "string" && req.payload.length > 0) {
                try {
                    body = JSON.parse(req.payload);
                    log(`[addComet] Parsed payload JSON keys: ${Object.keys(body).join(",")}`);
                } catch {
                    log("[addComet] payload is not valid JSON");
                }
            }
        }

        if (!body?.cometID) return fail(res, "Missing required field: cometID");

        const cometID = body.cometID.trim();
        log(`[addComet] Fetching data for comet ${cometID} ☄️`);

        // --- NASA API call ---
        const nasaUrl = `https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=${encodeURIComponent(cometID)}`;
        let nasaData: any;
        try {
            log(`[addComet] Calling NASA SBDB: ${nasaUrl}`);
            const response = await fetch(nasaUrl);
            const status = response.status;
            log(`[addComet] NASA response status: ${status}`);

            let rawPayload: string | null = null;
            let parsedPayload: any = null;
            try {
                rawPayload = await response.text();
                parsedPayload = rawPayload ? JSON.parse(rawPayload) : null;
            } catch {
                // Fall back to raw text payload if JSON parse fails
            }

            if (status === 300 && parsedPayload?.list?.length) {
                const { message, names } = buildCandidateMessage(cometID, parsedPayload.list);
                return fail(res, message, 409, {
                    cometID,
                    candidates: parsedPayload.list,
                    candidateNames: names,
                });
            }

            if (!response.ok) {
                const reason =
                    extractNasaMessage(parsedPayload) ?? `NASA SBDB request failed (${status})`;
                return fail(res, reason, status, {
                    cometID,
                    details: parsedPayload ?? rawPayload,
                });
            }

            if (!parsedPayload || typeof parsedPayload !== "object") {
                return fail(res, "Unexpected NASA SBDB response format", 502, {
                    cometID,
                    details: rawPayload,
                });
            }

            if (parsedPayload?.list?.length && !parsedPayload?.object) {
                // Handle ambiguous matches even if NASA returned HTTP 200 (e.g. neo filter cases)
                const { message, names } = buildCandidateMessage(cometID, parsedPayload.list);
                return fail(res, message, 409, {
                    cometID,
                    candidates: parsedPayload.list,
                    candidateNames: names,
                });
            }

            nasaData = parsedPayload;
            log("[addComet] Parsed NASA response successfully");
        } catch (err) {
            log(`[addComet] Error contacting NASA API: ${err}`);
            return fail(res, "Failed to fetch NASA SBDB data", 502);
        }

        if (!nasaData?.object?.fullname) {
            const nasaMessage = extractNasaMessage(nasaData);
            const reason =
                nasaMessage && nasaMessage.length > 0
                    ? nasaMessage
                    : `Comet ID "${cometID}" not found in NASA SBDB`;
            return fail(res, reason, 404, { cometID });
        }

        // --- Extract summary (correct field mapping) ---
        const els = nasaData.orbit?.elements ?? [];
        const val = (n: string) => els.find((e: any) => e.name === n)?.value ?? null;

        const summary = {
            name: nasaData.object.fullname ?? null,
            designation: nasaData.object.des ?? null,
            orbit_class: nasaData.object.orbit_class?.name ?? null,
            eccentricity: val("e") ? parseFloat(val("e")) : null,
            semi_major_axis: val("a") ? parseFloat(val("a")) : null,
            perihelion_distance: val("q") ? parseFloat(val("q")) : null,
            period_years: val("per") ? parseFloat(val("per")) / 365.25 : null,
            last_perihelion_year: val("tp") ? parseFloat(val("tp")) : null, // store JD directly
            // Orientation (degrees)
            inclination_deg: val("i") ? parseFloat(val("i")) : null,
            ascending_node_deg: val("om") ? parseFloat(val("om")) : null,
            arg_periapsis_deg: val("w") ? parseFloat(val("w")) : null,
            source: nasaData.signature?.source ?? "NASA/JPL SBDB",
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
            .setProject(projectId);

        if (apiKey && typeof apiKey === "string") {
            client.setKey(apiKey);
        }
        log("[addComet] Appwrite client configured");

        const tablesDB = new TablesDB(client);
        const databaseId = Deno.env.get("APPWRITE_DATABASE_ID") ?? "astroDB";
        const cometsTableId = Deno.env.get("APPWRITE_TABLE_COMETS") ?? "comets";
        const flybyTableId = Deno.env.get("APPWRITE_TABLE_FLYBYS") ?? "flybys";
        log(
            `[addComet] Using database ${databaseId}, comets table ${cometsTableId}, flybys table ${flybyTableId}`
        );

        // --- Prevent duplicates ---
        try {
            const existing = await tablesDB.listRows({
                databaseId,
                tableId: cometsTableId,
                queries: [Query.equal("designation", summary.designation)],
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
            log("[addComet] Creating comet row in Appwrite");
            newRow = await tablesDB.createRow({
                databaseId,
                tableId: cometsTableId,
                rowId: ID.unique(),
                data: summary,
            });
            log(`[addComet] Appwrite comet row created: ${newRow.$id}`);
        } catch (insertErr) {
            log(`[addComet] Failed to insert comet into Appwrite: ${insertErr}`);
            return fail(res, "Database insert failed", 500);
        }

        log(`[addComet] Successfully added comet ${summary.name} to Appwrite ✅`);

        // --- After comet insertion ---
        if (newRow && summary.period_years && summary.last_perihelion_year) {
            try {
                const period = summary.period_years;
                const jd = summary.last_perihelion_year;

                // Convert Julian Date → approximate decimal year
                const jdToYear = (jd: number) => (jd - 2451545) / 365.25 + 2000; // JD 2451545 = 2000-01-01

                const lastYear = jdToYear(jd);
                const flybys = [];

                // Generate 5 past + 1 future flyby estimates
                for (let n = -5; n <= 1; n++) {
                    flybys.push({
                        comet: newRow.$id,
                        year: lastYear + n * period,
                        description: null,
                        flagged: false,
                        llm_model_used: null,
                    });
                }

                // Insert flybys sequentially
                for (const f of flybys) {
                    log(`[addComet] Creating flyby for year ${f.year}`);
                    await tablesDB.createRow({
                        databaseId,
                        tableId: flybyTableId,
                        rowId: ID.unique(),
                        data: f,
                    });
                }

                log(`[addComet] Added ${flybys.length} flybys for comet ${summary.name}`);
            } catch (flyErr) {
                log(`[addComet] Failed to create flybys: ${flyErr}`);
            }
        }


        return ok(
            res,
            {
                success: true,
                message: `☄️ Comet ${summary.name} added successfully!`,
                comet: newRow,
            },
            201
        );
    } catch (e: any) {
        const msg = String(e?.message ?? e);
        error(`[addComet] Uncaught error 🚨: ${msg}`);
        return fail(res, "Internal server error", 500, { details: msg });
    }
};
