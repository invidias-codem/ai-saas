import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/firebaseAdmin";

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const { userId } = await auth();

        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Check if user has connected GitHub
        const githubDoc = await db
            .collection("users")
            .doc(userId)
            .collection("integrations")
            .doc("github")
            .get();

        const data = githubDoc.data();
        const connected = data?.isConnected === true && !!data?.accessToken;

        return NextResponse.json({
            connected,
            username: data?.username || null,
        });
    } catch (error) {
        console.error("[GitHub Status] Error:", error);
        return NextResponse.json(
            { error: "Failed to check GitHub status" },
            { status: 500 }
        );
    }
}
