import { NextRequest, NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

// PayPal can deliver webhooks as JSON or multipart/form-data (with a form field
// named `data` containing the JSON payload). This route handles both so it
// matches the actual webhook payload boundary, not just JSON.

const PAYPAL_WEBHOOK_ID = process.env.PAYPAL_WEBHOOK_ID;
import { CREDITS_PER_DOLLAR, matchPack } from '@/lib/subscription/packs';

const getSupabaseAdmin = () => {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
};

const eventEnvelopeSchema = z.object({
  event_type: z.string().optional(),
  id: z.string().optional(),
  webhook_id: z.string().optional(),
  resource: z
    .object({
      id: z.string().optional(),
      amount: z
        .object({
          value: z.string().optional(),
          currency_code: z.string().optional(),
        })
        .passthrough()
        .optional(),
      payer: z
        .object({
          email_address: z.string().optional(),
          payer_id: z.string().optional(),
        })
        .passthrough()
        .optional(),
    })
    .passthrough()
    .optional(),
});

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";
    let raw: any;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const dataField = formData.get("data");
      if (typeof dataField !== "string") {
        return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
      }
      raw = JSON.parse(dataField);
    } else {
      raw = await req.json();
    }

    const parsed = eventEnvelopeSchema.parse(raw);

    const webhookId = parsed.webhook_id || parsed.id;
    if (!PAYPAL_WEBHOOK_ID || webhookId !== PAYPAL_WEBHOOK_ID) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const eventType = parsed.event_type;
    if (!eventType || eventType !== "PAYMENT.CAPTURE.COMPLETED") {
      return NextResponse.json({ status: "ignored" }, { status: 200 });
    }

    const transactionId = parsed.resource?.id || parsed.id;
    const payerEmail =
      parsed.resource?.payer?.email_address ||
      parsed.resource?.payer?.payer_id ||
      "";

    const rawAmount = parsed.resource?.amount?.value;
    const amount = parseFloat(rawAmount || "0");
    const currency = parsed.resource?.amount?.currency_code || "USD";

    if (!transactionId || !payerEmail || amount <= 0) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { error: insertError } = await supabaseAdmin
      .from("payment_events")
      .insert({
        transaction_id: transactionId,
        email: payerEmail,
        amount: `${amount} ${currency}`,
      });

    if (insertError) {
      if (insertError.code === "23505") {
        return NextResponse.json({ status: "Already processed" }, { status: 200 });
      }
      throw insertError;
    }

    const client = await clerkClient();
    const users = await client.users.getUserList({
      emailAddress: [payerEmail],
    });

    if (users.data.length === 0) {
      return NextResponse.json({ status: "Unmatched user email" }, { status: 200 });
    }

    const user = users.data[0];

    // Credit the unified ledger (supporter_credits) — same ledger all spend
    // paths deduct from.
    const creditsToAdd = Math.floor(amount * CREDITS_PER_DOLLAR);
    const pack = matchPack(amount);

    const { error: creditError } = await supabaseAdmin.rpc('increment_credits', {
      p_user_id: user.id,
      p_amount: creditsToAdd,
      p_type: 'TOP_UP',
      p_description: `PayPal top-up: ${amount} ${currency}${pack ? ` (${pack.name})` : ''} (TX ${transactionId})`,
      p_metadata: { source: 'paypal', transaction_id: transactionId, amount, currency, pack: pack?.id ?? null },
    });

    if (creditError) {
      console.error(`PayPal Webhook: failed to credit ledger for ${payerEmail}:`, creditError);
      return NextResponse.json({ error: "Credit update failed" }, { status: 500 });
    }

    return NextResponse.json({ status: "Success", creditsAdded: creditsToAdd }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
