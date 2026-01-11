
import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForToken } from "@/lib/github";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/firebaseAdmin";
import { encrypt } from "@/lib/encryption";

export async function GET(req: NextRequest) {
    const { userId } = auth();
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const code = searchParams.get("code");
    const state = searchParams.get("state"); // Optional: Verify state against session to prevent CSRF

    if (!code) {
        return NextResponse.json({ error: "Missing code parameter" }, { status: 400 });
    }

    try {
        const rawAccessToken = await exchangeCodeForToken(code);
        const encryptedAccessToken = encrypt(rawAccessToken);

        // Save token to user's profile context (or integration specific collection)
        await db.collection("users").doc(userId).collection("integrations").doc("github").set({
            accessToken: encryptedAccessToken, // STORE ENCRYPTED!
            updatedAt: new Date(),
            isConnected: true
        }, { merge: true });

        // Redirect back to settings or chat
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
        return NextResponse.redirect(`${appUrl}/settings?github=connected`);

    } catch (error: any) {
        console.error("[GitHub Auth] Error:", error);
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
        return NextResponse.redirect(`${appUrl}/settings?github=error&message=${encodeURIComponent(error.message)}`);
    }
}
