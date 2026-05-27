import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabaseClient";

export async function POST() {
    try {
        const { userId } = await auth();

        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        if (!supabaseAdmin) {
            throw new Error("Supabase Admin client not initialized");
        }

        // Delete the GitHub integration record
        const { error } = await supabaseAdmin
            .from("user_integrations")
            .delete()
            .eq("user_id", userId)
            .eq("service_name", "github");

        if (error) {
            console.error("[GitHub Disconnect] Supabase Delete Error:", error);
            throw new Error("Failed to remove integration from database");
        }

        return NextResponse.json({ success: true, message: "GitHub account disconnected." });
    } catch (error) {
        console.error("[GitHub Disconnect] Error:", error);
        return NextResponse.json(
            { error: "Failed to disconnect GitHub account" },
            { status: 500 }
        );
    }
}
