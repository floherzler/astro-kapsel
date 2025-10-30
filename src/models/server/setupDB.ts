import { tablesDB } from "./config";
import * as sdk from "node-appwrite";

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
    } catch {
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
        await tablesDB.createStringColumn({ databaseId, tableId: "comets", key: "prefix", size: 4, required: false });
        await tablesDB.createStringColumn({ databaseId, tableId: "comets", key: "comet_status", size: 50, required: true });
        await tablesDB.createBooleanColumn({ databaseId, tableId: "comets", key: "is_viable", required: true });
        await tablesDB.createFloatColumn({ databaseId, tableId: "comets", key: "eccentricity", required: false });
        await tablesDB.createFloatColumn({ databaseId, tableId: "comets", key: "semi_major_axis", required: false });
        await tablesDB.createFloatColumn({ databaseId, tableId: "comets", key: "perihelion_distance", required: false });
        await tablesDB.createFloatColumn({ databaseId, tableId: "comets", key: "period_years", required: false });
        await tablesDB.createFloatColumn({ databaseId, tableId: "comets", key: "last_perihelion_year", required: false });
        await tablesDB.createFloatColumn({ databaseId, tableId: "comets", key: "inclination_deg", required: false });
        await tablesDB.createFloatColumn({ databaseId, tableId: "comets", key: "ascending_node_deg", required: false });
        await tablesDB.createFloatColumn({ databaseId, tableId: "comets", key: "arg_periapsis_deg", required: false });
        await tablesDB.createStringColumn({ databaseId, tableId: "comets", key: "source", size: 255, required: false });
    } catch (err: unknown) {
        const code = getErrorCode(err);
        if (code === 409) console.log("Comets table already exists");
        else console.error("Error creating comets table:", err);
    }

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

        await tablesDB.createRelationshipColumn({
            databaseId,
            tableId: "flybys",
            relatedTableId: "comets",
            type: sdk.RelationshipType.ManyToOne,
            key: "comet",
            twoWay: true,
            twoWayKey: "flybys",
            onDelete: sdk.RelationMutate.Cascade,
        });

        await tablesDB.createFloatColumn({ databaseId, tableId: "flybys", key: "year", required: true });
        await tablesDB.createStringColumn({ databaseId, tableId: "flybys", key: "description", size: 512, required: false });
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

        await tablesDB.createRelationshipColumn({
            databaseId,
            tableId: "sightings",
            relatedTableId: "flybys",
            type: sdk.RelationshipType.ManyToOne,
            key: "flyby",
            twoWay: true,
            twoWayKey: "sightings",
            onDelete: sdk.RelationMutate.Cascade,
        });

        await tablesDB.createStringColumn({ databaseId, tableId: "sightings", key: "observer_name", size: 255, required: true });
        await tablesDB.createFloatColumn({ databaseId, tableId: "sightings", key: "geo_lat", required: false });
        await tablesDB.createFloatColumn({ databaseId, tableId: "sightings", key: "geo_lon", required: false });
        await tablesDB.createStringColumn({ databaseId, tableId: "sightings", key: "note", size: 512, required: false });
    } catch (err: unknown) {
        const code = getErrorCode(err);
        if (code === 409) console.log("Sightings table already exists");
        else console.error("Error creating sightings table:", err);
    }

    // 4️⃣ Summaries Table
    try {
        await tablesDB.createTable({
            databaseId,
            tableId: "summaries",
            name: "Summaries",
            permissions: ["read(\"any\")"],
            rowSecurity: false,
        });
        console.log("Summaries table created");

        // Relationships
        await tablesDB.createRelationshipColumn({
            databaseId,
            tableId: "summaries",
            relatedTableId: "comets",
            type: sdk.RelationshipType.ManyToOne,
            key: "comet",
            twoWay: true,
            twoWayKey: "summaries",
            onDelete: sdk.RelationMutate.Cascade,
        });

        await tablesDB.createRelationshipColumn({
            databaseId,
            tableId: "summaries",
            relatedTableId: "flybys",
            type: sdk.RelationshipType.ManyToOne,
            key: "from_flyby",
            twoWay: true,
            twoWayKey: "summary_from",
            onDelete: sdk.RelationMutate.Cascade,
        });

        await tablesDB.createRelationshipColumn({
            databaseId,
            tableId: "summaries",
            relatedTableId: "flybys",
            type: sdk.RelationshipType.ManyToOne,
            key: "to_flyby",
            twoWay: true,
            twoWayKey: "summary_to",
            onDelete: sdk.RelationMutate.Cascade,
        });

        // Columns
        await tablesDB.createStringColumn({ databaseId, tableId: "summaries", key: "title", size: 255, required: true });
        await tablesDB.createStringColumn({ databaseId, tableId: "summaries", key: "summary", size: 65535, required: true });
        await tablesDB.createStringColumn({ databaseId, tableId: "summaries", key: "image_url", size: 512, required: false });
        await tablesDB.createStringColumn({ databaseId, tableId: "summaries", key: "llm_model_used", size: 255, required: false });
        await tablesDB.createDatetimeColumn({ databaseId, tableId: "summaries", key: "generated_at", required: true });
    } catch (err: unknown) {
        const code = getErrorCode(err);
        if (code === 409) console.log("Summaries table already exists");
        else console.error("Error creating summaries table:", err);
    }

    console.log("✅ Database setup completed with reverse relationships!");
    return tablesDB;
}
