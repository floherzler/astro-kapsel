// src/models/server/config.ts
import { Avatars, Client, Databases, TablesDB, Storage, Users } from "node-appwrite";
import dotenv from "dotenv";

dotenv.config(); // loads .env when running outside Next.js

// Fallback handling: prefer non-public vars in Node scripts, NEXT_PUBLIC_* in Next.js runtime
const endpoint =
    process.env.APPWRITE_ENDPOINT ||
    process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
const projectId =
    process.env.APPWRITE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY; // always private, only used server-side

if (!endpoint || !projectId || !apiKey) {
    console.error("❌ Missing Appwrite environment variables:");
    console.error("APPWRITE_ENDPOINT:", endpoint);
    console.error("APPWRITE_PROJECT_ID:", projectId);
    console.error("APPWRITE_API_KEY:", apiKey ? "(set)" : "❌ missing");
    process.exit(1);
}

const client = new Client()
    .setEndpoint(endpoint)
    .setProject(projectId)
    .setKey(apiKey);

const databases = new Databases(client);
const tablesDB = new TablesDB(client);
const avatars = new Avatars(client);
const storage = new Storage(client);
const users = new Users(client);

export { client, databases, tablesDB, users, avatars, storage };
