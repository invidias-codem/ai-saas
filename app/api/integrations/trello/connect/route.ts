
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/firebaseAdmin";
import { encrypt } from "@/lib/encryption";

export async function POST(req: NextRequest) {
    const { userId } = auth();
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { token } = body;

        if (!token) {
            return NextResponse.json({ error: "Token is required" }, { status: 400 });
        }

        const encryptedToken = encrypt(token);

        await db.collection("users").doc(userId).collection("integrations").doc("trello").set({
            accessToken: encryptedToken,
            updatedAt: new Date(),
            isConnected: true
        }, { merge: true });

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error("[Trello Connect] Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
