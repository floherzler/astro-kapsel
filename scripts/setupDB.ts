import getOrCreateDB from "../src/models/server/setupDB";

(async () => {
    console.log("🔭 Setting up Appwrite database...");
    await getOrCreateDB();
    console.log("✅ Database setup complete!");
    process.exit(0);
})();
