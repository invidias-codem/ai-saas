import { NextRequest, NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

// Helper to lazily initialize Supabase Admin Client
const getSupabaseAdmin = () => {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
};

const KOFI_WEBHOOK_SECRET = process.env.KOFI_WEBHOOK_SECRET!;
const CREDITS_PER_DOLLAR = 50; // Configure your exchange rate

export async function POST(req: NextRequest) {
  try {
    // 1. Parse Ko-Fi's unique payload structure
    // Ko-Fi sends application/x-www-form-urlencoded with a stringified 'data' field
    const formData = await req.formData();
    const rawData = formData.get("data");

    if (!rawData || typeof rawData !== "string") {
      return NextResponse.json({ error: "Invalid payload format" }, { status: 400 });
    }

    const payload = JSON.parse(rawData);

    // 2. Token Verification
    if (payload.verification_token !== KOFI_WEBHOOK_SECRET) {
      console.error("Ko-Fi Webhook Error: Invalid verification token");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const transactionId = payload.kofi_transaction_id;
    const buyerEmail = payload.email;
    const amount = parseFloat(payload.amount);

    // 3. Idempotency Check
    // Attempt to insert the transaction. If it fails due to the UNIQUE constraint, 
    // it means we've already processed it.
    const supabaseAdmin = getSupabaseAdmin();
    const { error: insertError } = await supabaseAdmin
      .from("payment_events")
      .insert({
        transaction_id: transactionId,
        email: buyerEmail,
        amount: payload.amount,
      });

    if (insertError) {
      if (insertError.code === "23505") { // Postgres unique violation code
        console.log(`Webhook ignored: Transaction ${transactionId} already processed.`);
        return NextResponse.json({ status: "Already processed" }, { status: 200 });
      }
      throw insertError;
    }

    // 4. Find the Clerk User by Email
    const client = await clerkClient();
    const users = await client.users.getUserList({
      emailAddress: [buyerEmail],
    });

    if (users.data.length === 0) {
      // CRITICAL: The payment succeeded, but the user used a different email on Ko-Fi.
      // We return 200 so Ko-Fi stops retrying, but you should log this to an 
      // "unmatched_payments" table to manually credit the user later.
      console.error(`Paid but unmatched email: ${buyerEmail} for TX: ${transactionId}`);
      return NextResponse.json({ status: "Unmatched user email" }, { status: 200 });
    }

    const user = users.data[0];

    // 5. Credit the unified ledger (supporter_credits) — the same ledger all
    // spend paths (chat, image, video, music, code) deduct from.
    const creditsToAdd = Math.floor(amount * CREDITS_PER_DOLLAR);

    const { error: creditError } = await supabaseAdmin.rpc('increment_credits', {
      p_user_id: user.id,
      p_amount: creditsToAdd,
      p_type: 'TOP_UP',
      p_description: `Ko-Fi top-up: $${amount} (TX ${transactionId})`,
      p_metadata: { source: 'kofi', transaction_id: transactionId, amount_usd: amount },
    });

    if (creditError) {
      console.error(`Ko-Fi Webhook: failed to credit ledger for ${buyerEmail}:`, creditError);
      // Return 500 so Ko-Fi retries; payment_events row insert will hit the
      // idempotency path next attempt only if we also roll it back — safer to
      // let the unique constraint short-circuit and surface for manual review.
      return NextResponse.json({ error: "Credit update failed" }, { status: 500 });
    }

    console.log(`Successfully added ${creditsToAdd} credits to ${buyerEmail}`);

    // 6. Acknowledge Receipt
    return NextResponse.json({ status: "Success" }, { status: 200 });

  } catch (error) {
    console.error("Ko-Fi Webhook Processing Error:", error);
    // Return 500 so Ko-Fi knows to retry the webhook later
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
