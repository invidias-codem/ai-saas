// app/api/webhooks/clerk/route.ts
// Handles Clerk user lifecycle events.
//
// user.created → provision supporter_credits row + grant FREE_WELCOME_CREDITS
// user.deleted → soft-mark the record (optional, non-destructive)
//
// Setup:
//   1. Clerk Dashboard → Webhooks → Add endpoint:
//      https://gen1e.xyz/api/webhooks/clerk
//   2. Subscribe to: user.created, user.deleted
//   3. Copy the Signing Secret → Vercel env var: CLERK_WEBHOOK_SECRET

import { NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { headers } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabaseClient';

// Credits granted to every new user — enough for a meaningful free trial:
//   25 chats  OR  12 code generations  OR  2 image generations
const FREE_WELCOME_CREDITS = 25;
const WELCOME_TIER = 'free';

type ClerkUserEvent = {
    type: string;
    data: {
        id: string;
        email_addresses: Array<{ email_address: string; id: string }>;
        primary_email_address_id: string;
        first_name: string | null;
        last_name: string | null;
        created_at: number;
    };
};

export async function POST(req: Request) {
    // ── 1. Verify Svix signature ─────────────────────────────────────────────
    const secret = process.env.CLERK_WEBHOOK_SECRET;
    if (!secret) {
        console.error('[Clerk Webhook] CLERK_WEBHOOK_SECRET not set');
        return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
    }

    const headerPayload = await headers();
    const svixId        = headerPayload.get('svix-id');
    const svixTimestamp = headerPayload.get('svix-timestamp');
    const svixSignature = headerPayload.get('svix-signature');

    if (!svixId || !svixTimestamp || !svixSignature) {
        return NextResponse.json({ error: 'Missing svix headers' }, { status: 400 });
    }

    const body = await req.text();

    let event: ClerkUserEvent;
    try {
        const wh = new Webhook(secret);
        event = wh.verify(body, {
            'svix-id':        svixId,
            'svix-timestamp': svixTimestamp,
            'svix-signature': svixSignature,
        }) as ClerkUserEvent;
    } catch (err) {
        console.error('[Clerk Webhook] Signature verification failed:', err);
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    if (!supabaseAdmin) {
        console.error('[Clerk Webhook] Supabase admin not configured');
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }

    // ── 2. Handle events ─────────────────────────────────────────────────────
    const { type, data } = event;
    console.log(`[Clerk Webhook] Event: ${type} | User: ${data.id}`);

    // ── user.created: provision credits ──────────────────────────────────────
    if (type === 'user.created') {
        const primaryEmail = data.email_addresses.find(
            e => e.id === data.primary_email_address_id
        )?.email_address ?? null;

        // Upsert supporter_credits row — idempotent (safe to retry)
        const { error } = await supabaseAdmin
            .from('supporter_credits')
            .upsert(
                {
                    user_id:        data.id,
                    email:          primaryEmail,
                    credit_balance: FREE_WELCOME_CREDITS,
                    tier:           WELCOME_TIER,
                },
                {
                    onConflict:        'user_id',
                    ignoreDuplicates:  true,   // Don't overwrite if row already exists
                }
            );

        if (error) {
            console.error('[Clerk Webhook] Failed to provision credits:', error);
            // Return 200 so Clerk doesn't retry forever — log for manual fix
            return NextResponse.json({ received: true, provisioned: false, error: error.message });
        }

        // Log the welcome grant in credit_transactions for audit trail
        await supabaseAdmin.rpc('increment_credits', {
            p_user_id:    data.id,
            p_amount:     0,        // Balance already set via upsert; this is just an audit log entry
            p_type:       'WELCOME',
            p_description: `Welcome gift: ${FREE_WELCOME_CREDITS} free credits`,
            p_metadata:   {
                source:         'clerk_signup',
                welcome_credits: FREE_WELCOME_CREDITS,
                email:           primaryEmail,
            },
        }).catch(() => {
            // Non-fatal — credits are already granted via upsert
        });

        console.log(`[Clerk Webhook] ✅ Provisioned ${FREE_WELCOME_CREDITS} welcome credits for ${data.id} (${primaryEmail})`);
        return NextResponse.json({ received: true, provisioned: true, credits: FREE_WELCOME_CREDITS });
    }

    // ── user.deleted: soft-mark only, never delete data ──────────────────────
    if (type === 'user.deleted') {
        await supabaseAdmin
            .from('supporter_credits')
            .update({ tier: 'deleted' })
            .eq('user_id', data.id)
            .catch(() => {});

        console.log(`[Clerk Webhook] User ${data.id} marked as deleted`);
        return NextResponse.json({ received: true });
    }

    // Unhandled event type — ack so Clerk doesn't retry
    return NextResponse.json({ received: true, handled: false });
}
