import { NextRequest, NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase Admin Client to bypass RLS for server-side inserts
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

    // 5. Calculate and Update Credits
    const currentCredits = (user.privateMetadata.computeCredits as number) || 0;
    const creditsToAdd = Math.floor(amount * CREDITS_PER_DOLLAR);
    const newCreditBalance = currentCredits + creditsToAdd;

    await client.users.updateUserMetadata(user.id, {
      privateMetadata: {
        ...user.privateMetadata,
        computeCredits: newCreditBalance,
      },
    });

    console.log(`Successfully added ${creditsToAdd} credits to ${buyerEmail}`);

    // 6. Acknowledge Receipt
    return NextResponse.json({ status: "Success" }, { status: 200 });

  } catch (error) {
    console.error("Ko-Fi Webhook Processing Error:", error);
    // Return 500 so Ko-Fi knows to retry the webhook later
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
