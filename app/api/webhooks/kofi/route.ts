// app/api/webhooks/kofi/route.ts — UPDATED
// Adds referral conversion tracking after successful donation.
// ~15 lines added vs original; all existing logic preserved.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseClient';
import { logReferralEvent, getReferralCodeForEmail } from '@/lib/referral';

export async function POST(req: Request) {
    try {
        const formData = await req.formData();
        const payload  = formData.get('data');

        if (!payload) {
            return NextResponse.json({ error: 'Missing data' }, { status: 400 });
        }

        const data = JSON.parse(payload as string);

        const verificationToken = process.env.KOFI_VERIFICATION_TOKEN;
        if (!verificationToken || data.verification_token !== verificationToken) {
            console.warn('[Ko-fi] Unauthorized webhook attempt');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const amount = parseFloat(data.amount);
        let creditsToAdd = 0;

        if (amount >= 50) creditsToAdd = 1000;
        else if (amount >= 15) creditsToAdd = 200;
        else if (amount >= 5)  creditsToAdd = 50;
        else creditsToAdd = Math.floor(amount * 10);

        console.log(`[Ko-fi] Processing donation: ${amount} ${data.currency} from ${data.email}. Adding ${creditsToAdd} credits.`);

        if (!supabaseAdmin) {
            console.error('[Ko-fi] Supabase Admin not configured');
            return NextResponse.json({ error: 'Server Error' }, { status: 500 });
        }

        const metadata = {
            kofi_transaction_id: data.message_id,
            email:               data.email,
            tier_name:           data.tier_name,
            kofi_data:           data
        };

        const { data: result, error } = await supabaseAdmin.rpc('process_kofi_donation', {
            p_kofi_transaction_id: data.message_id,
            p_email:               data.email,
            p_amount_usd:          amount,
            p_credits_to_add:      creditsToAdd,
            p_tier_name:           data.tier_name || 'Donation',
            p_metadata:            metadata
        });

        if (error) {
            console.error('[Ko-fi] RPC Error:', error);
            return NextResponse.json({ error: 'Database Error' }, { status: 500 });
        }

        const { success, duplicate, user_found } = result as any;

        if (duplicate) {
            console.log(`[Ko-fi] Duplicate transaction ${data.message_id} ignored.`);
            return NextResponse.json({ received: true, status: 'duplicate' });
        }

        // ─── REFERRAL TRACKING: log upgrade event ──────────────────────────────
        if (user_found && !duplicate) {
            try {
                const referral = await getReferralCodeForEmail(data.email);

                if (referral) {
                    await logReferralEvent({
                        code:      referral.code,
                        eventType: 'upgrade',
                        userId:    referral.userId,
                        amountUsd: amount,
                        platform:  'kofi',
                        metadata: {
                            kofi_transaction_id: data.message_id,
                            tier_name:           data.tier_name || 'Donation',
                            credits_added:       creditsToAdd,
                        },
                    });
                    console.log(`[Ko-fi] Referral upgrade logged: code=${referral.code} amount=$${amount}`);
                }
            } catch (refErr) {
                // Never let referral tracking failure break the payment flow
                console.error('[Ko-fi] Referral tracking error (non-fatal):', refErr);
            }
        }
        // ───────────────────────────────────────────────────────────────────────

        if (user_found) {
            console.log(`[Ko-fi] Successfully credited ${creditsToAdd} to user (via email: ${data.email})`);
        } else {
            console.log(`[Ko-fi] User not found for email ${data.email}. Donation recorded for manual claim.`);
        }

        return NextResponse.json({ received: true, processed: user_found });

    } catch (error: any) {
        console.error('[Ko-fi] Webhook Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
