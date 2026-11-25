import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyPayPalWebhook } from "@/lib/paypal/webhookVerification";
import { CREDITS_PER_DOLLAR, matchPack } from "@/lib/subscription/packs";

const eventEnvelopeSchema = z.object({
  event_type: z.string().optional(),
  id: z.string().optional(),
  webhook_id: z.string().optional(),
  resource: z
    .object({
      id: z.string().optional(),
      status: z.string().optional(),
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
      payee: z
        .object({
          email: z.string().optional(),
          merchant_id: z.string().optional(),
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
    let rawBody: string;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const dataField = formData.get("data");
      if (typeof dataField !== "string") {
        return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
      }
      rawBody = dataField;
    } else {
      rawBody = await req.text();
    }

    // ── 1. Verify PayPal webhook signature BEFORE any DB writes ──
    const headers: Record<string, string | undefined> = {};
    req.headers.forEach((value, key) => {
      headers[key] = value;
    });

    const verification = await verifyPayPalWebhook(headers, rawBody);
    if (!verification.verified) {
      return NextResponse.json(
        { error: "Webhook verification failed", reason: verification.reason },
        { status: 401 },
      );
    }

    // ── 2. Parse and validate the event envelope ──
    const parsed = eventEnvelopeSchema.parse(JSON.parse(rawBody));

    const eventType = parsed.event_type;
    if (!eventType || eventType !== "PAYMENT.CAPTURE.COMPLETED") {
      return NextResponse.json({ status: "ignored" }, { status: 200 });
    }

    const resource = parsed.resource;
    if (!resource) {
      return NextResponse.json({ error: "Missing resource" }, { status: 400 });
    }

    // ── 3. Validate capture status ──
    if (resource.status !== "COMPLETED") {
      return NextResponse.json(
        { error: `Capture not completed: ${resource.status ?? 'missing'}` },
        { status: 400 },
      );
    }

    // ── 4. Validate currency ──
    const currency = resource.amount?.currency_code;
    if (!currency || currency !== "USD") {
      return NextResponse.json(
        { error: `Unsupported currency: ${currency ?? 'missing'}` },
        { status: 400 },
      );
    }

    // ── 5. Validate amount: finite, positive ──
    const rawAmount = resource.amount?.value;
    const amount = parseFloat(rawAmount || "0");
    if (!isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { error: "Invalid amount: must be finite and positive" },
        { status: 400 },
      );
    }

    // ── 6. Validate transaction ID ──
    const transactionId = resource.id || parsed.id;
    if (!transactionId) {
      return NextResponse.json({ error: "Missing transaction ID" }, { status: 400 });
    }

    // ── 7. Validate payer/beneficiary ──
    const payerEmail = resource.payer?.email_address || resource.payer?.payer_id || "";
    if (!payerEmail) {
      return NextResponse.json({ error: "Missing payer identity" }, { status: 400 });
    }

    // ── 8. DB writes only after all validation ──
    const { createClient } = await import("@supabase/supabase-js");
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

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

    const { clerkClient } = await import("@clerk/nextjs/server");
    const client = await clerkClient();
    const users = await client.users.getUserList({
      emailAddress: [payerEmail],
    });

    if (users.data.length === 0) {
      return NextResponse.json({ status: "Unmatched user email" }, { status: 200 });
    }

    const user = users.data[0];

    // Credit the unified ledger (supporter_credits)
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
