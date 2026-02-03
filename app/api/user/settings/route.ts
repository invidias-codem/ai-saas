import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

// Lazy initialize Supabase client
function getSupabaseClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    return createClient(supabaseUrl, supabaseServiceKey);
}

export async function GET() {
    try {
        const { userId } = auth();

        if (!userId) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        const supabase = getSupabaseClient();
        const { data, error } = await supabase
            .from('user_settings')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 is "Row not found" (0 rows)
            console.error("[USER_SETTINGS_GET]", error);
            // Don't return error for missing row, just return empty/default
        }

        // Default settings if no row found
        const settings = data || { preferred_image_model: 'flux-schnell' };

        return NextResponse.json(settings);
    } catch (error) {
        console.error("[USER_SETTINGS_GET]", error);
        return new NextResponse("Internal Error", { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const { userId } = auth();
        const body = await req.json();
        const { preferred_image_model } = body;

        if (!userId) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        const supabase = getSupabaseClient();
        // Upsert settings
        const { data, error } = await supabase
            .from('user_settings')
            .upsert({
                user_id: userId,
                preferred_image_model,
                updated_at: new Date().toISOString()
            })
            .select()
            .single();

        if (error) {
            console.error("[USER_SETTINGS_POST]", error);
            return new NextResponse("Database Error", { status: 500 });
        }

        return NextResponse.json(data);
    } catch (error) {
        console.error("[USER_SETTINGS_POST]", error);
        return new NextResponse("Internal Error", { status: 500 });
    }
}
