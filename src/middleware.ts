import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware() {
    return NextResponse.next();
}

export const config = {
    matcher: [
        "/((?!api|_next/static|_next/image|favicon.ico).*)",
    ],
};
