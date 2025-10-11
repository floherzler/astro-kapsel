// src/lib/appwrite.ts
import { Client, Databases } from "appwrite";

const client = new Client()
    .setEndpoint(process.env.APPWRITE_ENDPOINT!)
    .setProject(process.env.APPWRITE_PROJECT!)

export const databases = new Databases(client);
export default client;
