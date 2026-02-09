import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseClient';

export async function POST(req: Request) {
    try {
        // 1. Verify Sender (FormData)
        const formData = await req.formData();
        const payload = formData.get('data');

        if (!payload) {
            return NextResponse.json({ error: 'Missing data' }, { status: 400 });
        }

        const data = JSON.parse(payload as string);

        // Security: Check Ko-fi Token
        // NOTE: User needs to add this to .env.local
        const verificationToken = process.env.KOFI_VERIFICATION_TOKEN;
        if (!verificationToken || data.verification_token !== verificationToken) {
            console.warn('[Ko-fi] Unauthorized webhook attempt');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // 2. Determine Credits based on Amount
        const amount = parseFloat(data.amount);
        let creditsToAdd = 0;
        // let unlockImport = false; // Logic can be added if we store features in DB

        if (amount >= 50) creditsToAdd = 1000;
        else if (amount >= 15) { creditsToAdd = 200; /* unlockImport = true; */ }
        else if (amount >= 5) creditsToAdd = 50;
        else creditsToAdd = Math.floor(amount * 10); // Fallback

        console.log(`[Ko-fi] Processing donation: ${amount} ${data.currency} from ${data.email}. Adding ${creditsToAdd} credits.`);

        // 3. Process Donation via Atomic RPC
        if (!supabaseAdmin) {
            console.error('[Ko-fi] Supabase Admin not configured');
            return NextResponse.json({ error: 'Server Error' }, { status: 500 });
        }

        // Metadata for the transaction
        const metadata = {
            kofi_transaction_id: data.message_id,
            email: data.email,
            tier_name: data.tier_name,
            kofi_data: data
        };

        const { data: result, error } = await supabaseAdmin.rpc('process_kofi_donation', {
            p_kofi_transaction_id: data.message_id,
            p_email: data.email,
            p_amount_usd: amount,
            p_credits_to_add: creditsToAdd,
            p_tier_name: data.tier_name || 'Donation',
            p_metadata: metadata
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

        if (user_found) {
            console.log(`[Ko-fi] Successfully credited ${creditsToAdd} to user (via email: ${data.email})`);
        } else {
            console.log(`[Ko-fi] User not found for email ${data.email}. Donation recorded for manual claim.`);
        }

        return NextResponse.json({ received: true, processed: user_found });

    } catch (error: any) {
        console.error('[Ko-fi] Webhook Error:', error);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
