import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import getOrCreateDB from "./models/server/setupDB";

export async function middleware(request: NextRequest) {
    if (process.env.NODE_ENV === "development") {
        try {
            await getOrCreateDB();
            console.log("✅ Local DB ensured");
        } catch (error) {
            console.error("⚠️ Error setting up local DB:", error);
        }
    }
    return NextResponse.next();
}

export const config = {
    matcher: [
        "/((?!api|_next/static|_next/image|favicon.ico).*)",
    ],
};
