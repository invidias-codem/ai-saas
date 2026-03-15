
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('--- Supabase Verification Script ---');
console.log(`URL: ${supabaseUrl}`);
console.log(`Service Key Present: ${!!supabaseServiceKey}`);
if (supabaseServiceKey) {
    console.log(`Service Key Prefix: ${supabaseServiceKey.substring(0, 10)}...`);
}

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing credentials in .env.local');
    process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

async function testConnection() {
    console.log('\n1. Testing Connection & Auth...');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser();
    // Note: Service role key doesn't sign in a user, so this usually returns null user without error, 
    // or might behave differently depending on config. But the key itself is what matters.
    // Actually, let's just try to read a table that is protected.

    console.log('   (Skipping explicit getUser for service role)');

    console.log('\n2. Testing RLS Bypass on "conversations" table...');
    // Try to select count. If RLS blocks us, we might get an error or 0.
    const { count, error: countError } = await supabaseAdmin
        .from('conversations')
        .select('*', { count: 'exact', head: true });

    if (countError) {
        console.error(`❌ Select failed: ${JSON.stringify(countError)}`);
    } else {
        console.log(`✅ Select success! Count: ${count}`);
    }

    console.log('\n3. Testing INSERT (RLS Bypass Check)...');
    // Attempt to insert a dummy record. We'll delete it immediately if successful.
    // We need a valid user_id normally, but if we are admin we might bypass constraints IF they are RLS based.
    // Foreign key constraints will still apply though.
    // Let's try to just select a specific non-owned record if we can find one, but we don't know IDs.

    // Actually, the user error is on INSERT.
    // "new row violates row-level security policy for table variables"

    // Let's try to see if we can read settings or something common.
    // Or better, check if we can list ALL conversations (normally RLS restricts to own).

    const { data: allConvs, error: listError } = await supabaseAdmin
        .from('conversations')
        .select('id, user_id')
        .limit(5);

    if (listError) {
        console.error(`❌ List failed: ${JSON.stringify(listError)}`);
    } else {
        console.log(`✅ List success! Retrieved ${allConvs?.length} records.`);
        if (allConvs && allConvs.length > 0) {
            console.log('   Sample User IDs:', allConvs.map(c => c.user_id));
        }
    }

    // Check if we can insert a dummy conversation for a random UUID
    const testUserId = '00000000-0000-0000-0000-000000000000';
    console.log(`\n4. Simulating INSERT for user ${testUserId}...`);

    const { data: insertData, error: insertError } = await supabaseAdmin
        .from('conversations')
        .insert({
            user_id: testUserId,
            title: 'DEBUG_TEST_CONVERSATION',
            is_deleted: true, // Delete immediately logic effectively
        })
        .select()
        .single();

    if (insertError) {
        console.error(`❌ INSERT Failed:`, insertError);
        console.log('   This confirms the RLS violation even with Service Key.');
    } else {
        console.log(`✅ INSERT Success! ID: ${insertData.id}`);
        // cleanup
        await supabaseAdmin.from('conversations').delete().eq('id', insertData.id);
    }
}

testConnection().catch(err => console.error('Unexpected error:', err));
