"use server";

import { currentUser } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabaseClient";

export async function syncUser() {
    try {
        const user = await currentUser();

        if (!user || !user.id || !user.emailAddresses?.[0]?.emailAddress) {
            return { success: false, error: "No user found" };
        }

        const email = user.emailAddresses[0].emailAddress;
        const fullName = `${user.firstName || ""} ${user.lastName || ""}`.trim();
        const avatarUrl = user.imageUrl;

        if (!supabaseAdmin) {
            console.error("Supabase Admin not initialized");
            return { success: false, error: "Database connection error" };
        }

        // Upsert into user_profiles — conflict on user_id first (normal path)
        const { error: profileError } = await supabaseAdmin
            .from("user_profiles")
            .upsert({
                user_id: user.id,
                email: email,
                full_name: fullName || null,
                avatar_url: avatarUrl || null,
                updated_at: new Date().toISOString(),
            }, { onConflict: "user_id" });

        if (profileError) {
            // If user_id upsert fails due to email unique constraint (e.g. user re-registered
            // with a new Clerk ID but same email), fall back to updating the existing row by email.
            if (profileError.code === "23505" && profileError.message.includes("email")) {
                const { error: updateError } = await supabaseAdmin
                    .from("user_profiles")
                    .update({
                        user_id: user.id,
                        full_name: fullName || null,
                        avatar_url: avatarUrl || null,
                        updated_at: new Date().toISOString(),
                    })
                    .eq("email", email);

                if (updateError) {
                    console.error("Error updating user profile by email:", updateError);
                    return { success: false, error: updateError.message };
                }
                // Successfully reconciled — email row now has the current user_id
                return { success: true };
            }

            console.error("Error syncing user profile:", profileError);
            return { success: false, error: profileError.message };
        }

        // Initialize credits if not exists (handled by trigger/logic, or we can explicit check here)
        // But for "lazy sync", we might want to also ensure they have a credits row.
        // The increment_credits function handles upsert, but pure sync might need explicit check.
        // Let's rely on `increment_credits` being called for TOP-UP.
        // For default credits (free tier), we can check and insert here if needed.
        // But let's keep it simple: just profile sync.

        /* 
           Optional: Initialize free credits if new user
           const { data: credits } = await supabaseAdmin.from('supporter_credits').select('user_id').eq('user_id', user.id).single();
           if (!credits) {
               await supabaseAdmin.from('supporter_credits').insert({ user_id: user.id, credit_balance: 10 }); // 10 Free credits
           }
        */

        return { success: true };
    } catch (error) {
        console.error("Sync user error:", error);
        return { success: false, error: "Internal error" };
    }
}
