import * as sdk from "npm:node-appwrite";
const { Client, TablesDB, ID, Query } = sdk;

export default async ({ req, res, log }: any) => {
    try {
        // --- Parse cometID ---
        let cometID: string | undefined;
        try {
            ({ cometID } = await req.json());
        } catch {
            if (req.bodyText) ({ cometID } = JSON.parse(req.bodyText));
            else if (req.payload) ({ cometID } = JSON.parse(req.payload));
        }
        if (!cometID) return res.json({ error: "Missing cometID" }, 400);

        // --- Fetch NASA SBDB ---
        const url = `https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=${encodeURIComponent(cometID.trim())}`;
        const resp = await fetch(url);
        if (!resp.ok) return res.json({ error: `NASA API ${resp.status}` }, resp.status);
        const d = await resp.json();
        if (!d?.object?.fullname) return res.json({ error: "Comet not found" }, 404);

        // --- Helper functions ---
        const els = d.orbit?.elements ?? [];
        const val = (n: string) => els.find((e: any) => e.name === n)?.value ?? null;
        const jdToYear = (jd: number) =>
            new Date((jd - 2440587.5) * 86400000).getUTCFullYear();

        // --- Prepare row data (all snake_case) ---
        const row = {
            name: d.object.fullname ?? null,
            designation: d.object.des ?? null,
            orbit_class: d.object.orbit_class?.name ?? null,
            eccentricity: parseFloat(val("e")),
            semi_major_axis: parseFloat(val("a")),
            perihelion_distance: parseFloat(val("q")),
            period_years: val("per") ? parseFloat(val("per")) / 365.25 : null,
            last_perihelion_year: val("tp") ? parseFloat(val("tp")) : null,
            source: d.signature?.source ?? "NASA/JPL SBDB",
        };

        // --- Appwrite connection ---
        const client = new Client()
            .setEndpoint(Deno.env.get("APPWRITE_FUNCTION_API_ENDPOINT") ?? "")
            .setProject(Deno.env.get("APPWRITE_FUNCTION_PROJECT_ID") ?? "")
            .setKey(Deno.env.get("APPWRITE_API_KEY") ?? "");

        const tables = new TablesDB(client);
        const databaseId = Deno.env.get("APPWRITE_DATABASE_ID") ?? "astroDB";
        const tableId = Deno.env.get("APPWRITE_TABLE_COMETS") ?? "comets";

        // --- Prevent duplicates ---
        const existing = await tables.listRows({
            databaseId,
            tableId,
            queries: [Query.equal("designation", row.designation)],
        });
        if (existing.total > 0) {
            return res.json({ message: "Comet already exists", comet: existing.rows[0] }, 200);
        }

        // --- Insert ---
        const comet = await tables.createRow({
            databaseId,
            tableId,
            rowId: ID.unique(),
            data: row,
        });

        return res.json({ success: true, comet }, 201);
    } catch (e) {
        log(`addComet error: ${e}`);
        return res.json({ error: "Internal server error", details: String(e) }, 500);
    }
};
