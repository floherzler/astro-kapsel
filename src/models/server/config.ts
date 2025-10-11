import { Avatars, Client, Databases, TablesDB, Storage, Users } from "node-appwrite"
import dotenv from "dotenv"

dotenv.config();

let client = new Client();

client
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!)
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!)
    .setKey(process.env.APPWRITE_API_KEY!);

const databases = new Databases(client);
const tablesDB = new TablesDB(client);
const avatars = new Avatars(client);
const storage = new Storage(client);
const users = new Users(client)


export { client, databases, tablesDB, users, avatars, storage }