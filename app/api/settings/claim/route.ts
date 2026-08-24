// app/api/settings/claim/route.ts
// Manual claim fallback: a user whose Ko-fi email differs from their Clerk account
// can submit a Ko-fi transaction ID here to extend premium_until.
// Validates the transaction exists in payment_events and that the submitted email
// matches the buyer email recorded during the webhook delivery.
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/security/apiAuth";
import { clerkClient } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

const getSupabaseAdmin = () => {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
};

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    try {
        const user = await requireAuth();

        const body = (await req.json().catch(() => null)) as
            | { transaction_id?: string; email?: string }
            | null;

        if (!body?.transaction_id?.trim() || !body?.email?.trim()) {
            return NextResponse.json(
                { error: "transaction_id and email are required" },
                { status: 400 }
            );
        }

        const supabaseAdmin = getSupabaseAdmin();

        // Look up the recorded payment event
        const { data: event, error: eventError } = await supabaseAdmin
            .from("payment_events")
            .select("transaction_id, email, amount")
            .eq("transaction_id", body.transaction_id.trim())
            .maybeSingle();

        if (eventError || !event) {
            return NextResponse.json(
                { error: "Transaction not found. Check the ID and try again." },
                { status: 404 }
            );
        }

        // Verify the submitted email matches the Ko-fi buyer email recorded by the webhook
        const normalizedInput = body.email.trim().toLowerCase();
        const normalizedRecorded = event.email?.trim().toLowerCase();

        if (normalizedInput !== normalizedRecorded) {
            return NextResponse.json(
                { error: "Email does not match the buyer email on this Ko-Fi transaction." },
                { status: 403 }
            );
        }

        // Resolve the Clerk user's own email to confirm consistency
        const client = await clerkClient();
        const clerkUser = await client.users.getUser(user.userId);
        const clerkEmail = clerkUser.emailAddresses?.[0]?.emailAddress?.trim().toLowerCase();

        if (!clerkEmail || clerkEmail !== normalizedInput) {
            return NextResponse.json(
                {
                    error:
                        "This Ko-Fi email does not match your Lattice OS account. Update your Clerk email or contact support.",
                },
                { status: 403 }
            );
        }

        // Grant 30-day premium access
        const premiumUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

        const { error: subError } = await supabaseAdmin
            .from("subscriptions")
            .upsert(
                {
                    clerk_user_id: user.userId,
                    tier: "pro",
                    premium_until: premiumUntil,
                },
                { onConflict: "clerk_user_id" }
            );

        if (subError) {
            console.error("[claim] subscription upsert failed:", subError);
            return NextResponse.json(
                { error: "Failed to activate premium. Contact support." },
                { status: 500 }
            );
        }

        return NextResponse.json({
            status: "ok",
            premium_until: premiumUntil,
        });
    } catch (error) {
        console.error("[claim] processing error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
