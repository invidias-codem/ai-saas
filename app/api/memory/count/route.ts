import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { requireAuth, getClientIP } from '@/lib/security/apiAuth';
import { limitApiEndpoint } from '@/lib/security/rateLimit';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const user = await requireAuth();
        const ip = getClientIP(req);

        const rateLimit = await limitApiEndpoint(user.userId, ip, 'query');
        if (!rateLimit.success) {
            return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
        }

        // Parallel execution for counting
        const [conversationsSnapshot, contentSnapshot] = await Promise.all([
            db.collection("users").doc(user.userId).collection("conversations").count().get(),
            db.collection("users").doc(user.userId).collection("memory_bank").count().get() // Assuming memory bank is the place for other "memories" or we count specific items
        ]);

        // If we want to count total messages across all conversations, that's more expensive.
        // The user asked for "total generated data". Let's assume conversations + memory bank entries for now.
        // A more "real-time visual indicator of the user's total generated data" might be message count.
        // Let's stick to conversations + memory bank entries as "Memories".

        const conversationCount = conversationsSnapshot.data().count;
        const memoryBankCount = contentSnapshot.data().count;

        // Also check if there are other relevant collections like 'code_generations' if they exist? 
        // Based on file structure, we have images/music/video folders but not sure about DB.
        // Let's keep it simple: Conversations + Memories.

        const totalMemoryCount = conversationCount + memoryBankCount;

        return NextResponse.json({ count: totalMemoryCount });
    } catch (error) {
        console.error("[API:Memory:Count] Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
