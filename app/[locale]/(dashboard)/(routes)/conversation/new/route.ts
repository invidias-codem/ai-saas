import { redirect } from 'next/navigation';
import { auth } from "@clerk/nextjs/server";

/**
 * New Conversation Route
 * Creates a new conversation and redirects to it
 * GET /conversation/new
 */
export async function GET() {
    const { userId } = await auth();

    if (!userId) {
        redirect('/sign-in?redirect_url=/conversation');
    }

    // Import Supabase client
    const { supabase } = await import("@/lib/supabaseClient");

    if (!supabase) {
        console.error("Supabase client not initialized");
        redirect('/conversation');
    }

    // Create new conversation
    const { data, error } = await supabase
        .from("conversations")
        .insert({
            user_id: userId,
            title: "New Conversation",
            is_deleted: false,
            is_archived: false,
        })
        .select()
        .single();

    if (error || !data) {
        console.error("[Conversation:New] Error creating conversation:", error);
        redirect('/conversation');
    }

    console.log(`[Conversation:New] Created conversation ${data.id}`);

    // Redirect to the new conversation
    redirect(`/conversation/${data.id}`);
}
