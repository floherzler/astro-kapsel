import { tablesDB } from "./config";

function getErrorCode(err: unknown): number | undefined {
    if (typeof err === "object" && err !== null && "code" in err) {
        const code = (err as { code?: unknown }).code;
        return typeof code === "number" ? code : undefined;
    }
    return undefined;
}

export default async function getOrCreateDB() {
    const databaseId = process.env.APPWRITE_DATABASE_ID!;

    try {
        await tablesDB.get({ databaseId });
        console.log("Database connected!");
    } catch (error: unknown) {
        try {
            await tablesDB.create({
                databaseId,
                name: "astroDB",
            });
            console.log("Database created");
        } catch (err: unknown) {
            console.error("Error creating database:", err);
            return;
        }
    }

    // --- CREATE TABLES ---

    // 1️⃣ Comets Table
    try {
        await tablesDB.createTable({
            databaseId,
            tableId: "comets",
            name: "Comets",
            permissions: ["read(\"any\")"],
            rowSecurity: false,
        });
        console.log("Comets table created");

        await tablesDB.createStringColumn({ databaseId, tableId: "comets", key: "name", size: 255, required: true });
        await tablesDB.createStringColumn({ databaseId, tableId: "comets", key: "designation", size: 255, required: false });
        await tablesDB.createStringColumn({ databaseId, tableId: "comets", key: "orbit_class", size: 255, required: false });
        await tablesDB.createFloatColumn({ databaseId, tableId: "comets", key: "eccentricity", required: false });
        await tablesDB.createFloatColumn({ databaseId, tableId: "comets", key: "semi_major_axis", required: false });
        await tablesDB.createFloatColumn({ databaseId, tableId: "comets", key: "perihelion_distance", required: false });
        await tablesDB.createFloatColumn({ databaseId, tableId: "comets", key: "period_years", required: false });
        await tablesDB.createFloatColumn({ databaseId, tableId: "comets", key: "last_perihelion_year", required: false });
        // Orientation columns (degrees)
        await tablesDB.createFloatColumn({ databaseId, tableId: "comets", key: "inclination_deg", required: false });
        await tablesDB.createFloatColumn({ databaseId, tableId: "comets", key: "ascending_node_deg", required: false });
        await tablesDB.createFloatColumn({ databaseId, tableId: "comets", key: "arg_periapsis_deg", required: false });
        await tablesDB.createStringColumn({ databaseId, tableId: "comets", key: "source", size: 255, required: false });
    } catch (err: unknown) {
        const code = getErrorCode(err);
        if (code === 409) console.log("Comets table already exists");
        else console.error("Error creating comets table:", err);
    }

    // Try to add missing orientation columns for existing installs
    try { await tablesDB.createFloatColumn({ databaseId, tableId: "comets", key: "inclination_deg", required: false }); } catch (e: unknown) { const code = getErrorCode(e); if (code !== 409) console.warn("inclination_deg add failed", e); }
    try { await tablesDB.createFloatColumn({ databaseId, tableId: "comets", key: "ascending_node_deg", required: false }); } catch (e: unknown) { const code = getErrorCode(e); if (code !== 409) console.warn("ascending_node_deg add failed", e); }
    try { await tablesDB.createFloatColumn({ databaseId, tableId: "comets", key: "arg_periapsis_deg", required: false }); } catch (e: unknown) { const code = getErrorCode(e); if (code !== 409) console.warn("arg_periapsis_deg add failed", e); }

    // 2️⃣ Flybys Table
    try {
        await tablesDB.createTable({
            databaseId,
            tableId: "flybys",
            name: "Flybys",
            permissions: ["read(\"any\")"],
            rowSecurity: false,
        });
        console.log("Flybys table created");

        await tablesDB.createStringColumn({ databaseId, tableId: "flybys", key: "comet_id", size: 255, required: true });
        await tablesDB.createFloatColumn({ databaseId, tableId: "flybys", key: "year", required: true });
        await tablesDB.createStringColumn({ databaseId, tableId: "flybys", key: "description", size: 255, required: false });
        await tablesDB.createBooleanColumn({ databaseId, tableId: "flybys", key: "flagged", required: false });
        await tablesDB.createStringColumn({ databaseId, tableId: "flybys", key: "llm_model_used", size: 255, required: false });
    } catch (err: unknown) {
        const code = getErrorCode(err);
        if (code === 409) console.log("Flybys table already exists");
        else console.error("Error creating flybys table:", err);
    }

    // 3️⃣ Sightings Table
    try {
        await tablesDB.createTable({
            databaseId,
            tableId: "sightings",
            name: "Sightings",
            permissions: ["read(\"any\")"],
            rowSecurity: false,
        });
        console.log("Sightings table created");

        await tablesDB.createStringColumn({ databaseId, tableId: "sightings", key: "flyby_id", size: 255, required: true });
        await tablesDB.createStringColumn({ databaseId, tableId: "sightings", key: "observer_name", size: 255, required: false });
        await tablesDB.createFloatColumn({ databaseId, tableId: "sightings", key: "geo_lat", required: false });
        await tablesDB.createFloatColumn({ databaseId, tableId: "sightings", key: "geo_lon", required: false });
        await tablesDB.createStringColumn({ databaseId, tableId: "sightings", key: "note", size: 255, required: false });
    } catch (err: unknown) {
        const code = getErrorCode(err);
        if (code === 409) console.log("Sightings table already exists");
        else console.error("Error creating sightings table:", err);
    }

    console.log("✅ Database setup completed!");
    return tablesDB;
}
