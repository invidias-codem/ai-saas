import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabaseClient";

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const { userId } = await auth();

        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        if (!supabaseAdmin) {
            throw new Error("Supabase Admin client not initialized");
        }

        const { data, error } = await supabaseAdmin
            .from('user_integrations')
            .select('is_connected, access_token_encrypted, metadata')
            .eq('user_id', userId)
            .eq('service_name', 'github')
            .single();

        if (error && error.code !== 'PGRST116') {
            console.error("[GitHub Status] Supabase fetch error:", error);
        }

        const connected = data?.is_connected === true && !!data?.access_token_encrypted;
        const metadata = data?.metadata || {};

        return NextResponse.json({
            connected,
            username: metadata.github_login || null,
            email: metadata.github_email || null,
        });
    } catch (error) {
        console.error("[GitHub Status] Error:", error);
        return NextResponse.json(
            { error: "Failed to check GitHub status" },
            { status: 500 }
        );
    }
}
