import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabaseClient";

export async function POST(req: NextRequest) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { repo } = await req.json();

    try {
        if (!supabaseAdmin) {
            console.error("Supabase Admin client not initialized");
            return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
        }

        // Delete all memories with featureType: 'github' for this user (and optionally repo)
        let query = supabaseAdmin
            .from('memories')
            .delete()
            .eq('user_id', userId)
            .eq('metadata->>featureType', 'github');

        if (repo) {
            query = query.eq('metadata->>repo', repo);
        }

        const { error } = await query;

        if (error) throw error;

        return NextResponse.json({ success: true, message: "Cleared GitHub context" });
    } catch (error: any) {
        console.error("[GitHub Clear] Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
