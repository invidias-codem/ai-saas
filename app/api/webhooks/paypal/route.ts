import { NextRequest, NextResponse } from "next/server";
import { verifyPayPalWebhook } from "@/lib/paypal/webhookVerification";
import { z } from "zod";

// Maximum credit amount per webhook event to prevent overrun from a single
// malicious or erroneous event. $10,000 USD = 1,000,000 cents.
const MAX_AMOUNT_CENTS = 1_000_000;

// Strict decimal amount: whole dollars with up to 2 fractional digits.
// Rejects partially numeric strings (e.g. "10abc") that parseFloat would accept.
const DECIMAL_AMOUNT_RE = /^\d+(\.\d{1,2})?$/;

const eventEnvelopeSchema = z.object({
  event_type: z.string().optional(),
  id: z.string().optional(),
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

    if (parsed.event_type !== "PAYMENT.CAPTURE.COMPLETED") {
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

    // ── 5. Validate amount: strict decimal, integer cents ──
    const rawAmount = resource.amount?.value;
    if (!rawAmount || typeof rawAmount !== "string" || !DECIMAL_AMOUNT_RE.test(rawAmount)) {
      return NextResponse.json({ error: "Invalid amount format" }, { status: 400 });
    }
    const amountCents = Math.round(Number(rawAmount) * 100);
    if (amountCents <= 0) {
      return NextResponse.json({ error: "Amount must be positive" }, { status: 400 });
    }
    if (amountCents > MAX_AMOUNT_CENTS) {
      return NextResponse.json(
        { error: "Amount exceeds per-event cap" },
        { status: 400 },
      );
    }

    // ── 6. Validate capture ID (no fallback to webhook event ID) ──
    const transactionId = resource.id;
    if (!transactionId || typeof transactionId !== "string" || transactionId.trim() === "") {
      return NextResponse.json({ error: "Missing capture ID" }, { status: 400 });
    }

    // ── 7. Validate merchant/beneficiary binding — fail-closed ──
    // Reject when PAYPAL_MERCHANT_ID is not configured OR does not match.
    // Read at request time so test env mutations are visible.
    const expectedMerchantId = process.env.PAYPAL_MERCHANT_ID;
    if (!expectedMerchantId) {
      return NextResponse.json(
        { error: "Merchant configuration missing; settlement blocked" },
        { status: 400 },
      );
    }
    const payee = resource.payee;
    if (!payee || !payee.merchant_id || payee.merchant_id !== expectedMerchantId) {
      return NextResponse.json(
        { error: "Merchant/beneficiary binding missing or mismatch" },
        { status: 400 },
      );
    }

    // ── 8. Idempotency: record payment event, reject duplicates ──
    const { createClient } = await import("@supabase/supabase-js");
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { error: insertError } = await supabaseAdmin
      .from("payment_events")
      .insert({ transaction_id: transactionId, amount: `${amountCents / 100} ${currency}` });

    if (insertError) {
      if (insertError.code === "23505") {
        return NextResponse.json({ status: "Already processed" }, { status: 200 });
      }
      throw insertError;
    }

    // ── 9. Settlement pending S8 atomic ledger qualification ──
    // Credits are NOT issued. Authoritative ownership (purchase intent → user
    // binding) is established through S8. Until then, credit settlement is
    // fail-closed: no payer-email lookups, no Clerk mutations, no ledger writes.
    return NextResponse.json(
      {
        status: "Settlement pending S8 atomic ledger qualification",
        transaction_id: transactionId,
      },
      { status: 402 },
    );
  } catch (error) {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
