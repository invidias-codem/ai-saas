import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireEnv } from "@/lib/env";

// Lazy initialize Supabase Admin Client
function getSupabaseAdmin() {
    return createClient(
        requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
        requireEnv("SUPABASE_SERVICE_ROLE_KEY")
    );
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const headersList = headers();

        // Verify Secret (Basic security)
        const secret = new URL(req.url).searchParams.get("secret");
        if (secret !== process.env.VERCEL_LOG_WEBHOOK_SECRET) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Process logs (Vercel sends an array of logs)
        // The format depends on the integration, but usually it's a list of JSON objects
        const logs = Array.isArray(body) ? body : [body];

        const formattedLogs = logs.map((log: any) => {
            const level = log.level || "info";
            return {
                timestamp: log.timestamp ? new Date(log.timestamp) : new Date(),
                level,
                message: log.message || JSON.stringify(log),
                source: log.source || "vercel",
                metadata: log,
                // Flag error-level logs for autonomous resolution pipeline
                resolution_status: level === "error" ? "pending" : null,
                updated_at: new Date().toISOString(),
            };
        });

        const supabaseAdmin = getSupabaseAdmin();
        const { error } = await supabaseAdmin
            .from("logs")
            .insert(formattedLogs);

        if (error) {
            console.error("Error inserting logs:", error);
            return NextResponse.json({ error: "Database Error" }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error processing log webhook:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
