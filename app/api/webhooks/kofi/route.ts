import { NextRequest, NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

const getSupabaseAdmin = () => {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
};

import { CREDITS_PER_DOLLAR, matchPack } from "@/lib/subscription/packs";
const KOFI_WEBHOOK_SECRET = process.env.KOFI_WEBHOOK_SECRET!;

export async function POST(req: NextRequest) {
  try {
    const supabaseAdmin = getSupabaseAdmin();

    // ── 1. Parse payload ──────────────────────────────────────────
    const formData = await req.formData();
    const rawData = formData.get("data");

    if (!rawData || typeof rawData !== "string") {
      return NextResponse.json({ error: "Invalid payload format" }, { status: 400 });
    }

    const payload = JSON.parse(rawData);

    // ── 2. Verify token (HMAC-style check against shared secret) ──
    if (payload.verification_token !== KOFI_WEBHOOK_SECRET) {
      console.error("Ko-Fi Webhook Error: Invalid verification token");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const transactionId = payload.kofi_transaction_id;
    const buyerEmail = payload.email;
    const amount = parseFloat(payload.amount);

    if (!transactionId || !buyerEmail || !amount) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // ── 3. Idempotency: short-circuit if already processed ────────
    const { data: existing } = await supabaseAdmin
        .from("payment_events")
        .select("transaction_id")
        .eq("transaction_id", transactionId)
        .maybeSingle();

    if (existing) {
        console.log(`Webhook ignored: Transaction ${transactionId} already processed.`);
        return NextResponse.json({ status: "Already processed" }, { status: 200 });
    }

    // ── 4. Find the Clerk User by Email ──────────────────────────
    const client = await clerkClient();
    const users = await client.users.getUserList({
      emailAddress: [buyerEmail],
    });

    if (users.data.length === 0) {
      // Payment succeeded but Ko-fi email doesn't match any Clerk user.
      // Record as unmatched so the manual-claim fallback can pick it up.
      await supabaseAdmin.from("payment_events").insert({
        transaction_id: transactionId,
        email: buyerEmail,
        amount: payload.amount,
        processed: true,
        matched: false,
      });
      console.error(`Paid but unmatched email: ${buyerEmail} for TX: ${transactionId}`);
      return NextResponse.json({ status: "Unmatched user email" }, { status: 200 });
    }

    const clerkUser = users.data[0];

    // ── 5a. Credit the unified ledger (existing behavior) ─────────
    const creditsToAdd = Math.floor(amount * CREDITS_PER_DOLLAR);
    const pack = matchPack(amount);

    const { error: creditError } = await supabaseAdmin.rpc("increment_credits", {
      p_user_id: clerkUser.id,
      p_amount: creditsToAdd,
      p_type: "TOP_UP",
      p_description: `Ko-Fi top-up: $${amount}${pack ? ` (${pack.name})` : ""} (TX ${transactionId})`,
      p_metadata: { source: "kofi", transaction_id: transactionId, amount_usd: amount, pack: pack?.id ?? null },
    });

    if (creditError) {
      console.error(`Ko-Fi Webhook: failed to credit ledger for ${buyerEmail}:`, creditError);
      return NextResponse.json({ error: "Credit update failed" }, { status: 500 });
    }

    // ── 5b. Extend subscription (30-day premium access) ──────────
    const premiumUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const { error: subError } = await supabaseAdmin
      .from("subscriptions")
      .upsert(
        {
          clerk_user_id: clerkUser.id,
          tier: "pro",
          premium_until: premiumUntil,
        },
        { onConflict: "clerk_user_id" }
      );

    if (subError) {
      console.error(`Ko-Fi Webhook: failed to extend subscription for ${buyerEmail}:`, subError);
      return NextResponse.json({ error: "Subscription update failed" }, { status: 500 });
    }

    // ── 6. Record idempotency ONLY after both operations succeed ──
    await supabaseAdmin.from("payment_events").insert({
      transaction_id: transactionId,
      email: buyerEmail,
      amount: payload.amount,
      processed: true,
      matched: true,
    });

    console.log(`Ko-Fi: ${creditsToAdd} credits + premium (30d) granted to ${buyerEmail}`);
    return NextResponse.json({ status: "Success", credits: creditsToAdd, premium_until: premiumUntil });

  } catch (error) {
    console.error("Ko-Fi Webhook Processing Error:", error);
    // Return 500 so Ko-Fi retries; nothing is recorded yet so idempotency is safe.
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
