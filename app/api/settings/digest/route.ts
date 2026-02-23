import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabaseClient';

export async function GET() {
    try {
        const { userId } = await auth();
        if (!userId) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        if (!supabaseAdmin) {
            console.warn("[SETTINGS_DIGEST_GET] supabaseAdmin not configured");
            return NextResponse.json({ enabled: false });
        }

        const { data, error } = await supabaseAdmin
            .from('user_settings')
            .select('daily_digest_enabled')
            .eq('user_id', userId)
            .single();

        if (error && error.code !== 'PGRST116') {
            throw error;
        }

        return NextResponse.json({
            enabled: data?.daily_digest_enabled ?? false
        });

    } catch (error: any) {
        console.error("[SETTINGS_DIGEST_GET]", error);
        return new NextResponse(JSON.stringify({ error: error.message }), { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        if (!supabaseAdmin) {
            return new NextResponse(
                JSON.stringify({ error: "Database not configured" }), 
                { status: 503 }
            );
        }

        const { enabled } = await req.json();

        if (typeof enabled !== 'boolean') {
            return new NextResponse("Invalid request body", { status: 400 });
        }

        // Use supabaseAdmin with service role - userId is validated server-side
        const { error } = await supabaseAdmin
            .from('user_settings')
            .upsert({
                user_id: userId,
                daily_digest_enabled: enabled,
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id' });

        if (error) throw error;

        return NextResponse.json({ success: true, enabled });

    } catch (error: any) {
        console.error("[SETTINGS_DIGEST_POST]", error);
        return new NextResponse(JSON.stringify({ error: error.message }), { status: 500 });
    }
}
