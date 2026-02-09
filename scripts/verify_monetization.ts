import dotenv from 'dotenv';
import path from 'path';

// Force load .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function verify() {
    console.log("🔍 Verifying Monetization Schema...");

    // Dynamic import to ensure env vars are loaded first
    const { supabaseAdmin } = await import("@/lib/supabaseClient");

    if (!supabaseAdmin) {
        console.error("❌ Supabase Admin not initialized. Check SUPABASE_SERVICE_ROLE_KEY in .env.local");
        console.log("Debug: SUPABASE_SERVICE_ROLE_KEY is", process.env.SUPABASE_SERVICE_ROLE_KEY ? "Set" : "Missing");
        process.exit(1);
    }

    try {
        // 1. Check user_profiles and structure
        const { data: profiles, error: error1 } = await supabaseAdmin.from('user_profiles').select('avatar_url').limit(1);

        if (error1) {
            if (error1.message.includes("does not exist") || error1.code === 'PGRST301') {
                console.error("❌ user_profiles table MISSING or avatar_url column MISSING:", error1.message);
            } else {
                console.error("❌ user_profiles check failed:", error1.message);
            }
        } else {
            console.log("✅ user_profiles table exists and has avatar_url column");
        }

        // 2. Check credit_transactions
        const { error: error2 } = await supabaseAdmin.from('credit_transactions').select('count', { count: 'exact', head: true });
        if (error2) {
            console.error("❌ credit_transactions table check failed:", error2.message);
        } else {
            console.log("✅ credit_transactions table exists");
        }

        // 3. Check supporter_credits
        const { error: error3 } = await supabaseAdmin.from('supporter_credits').select('count', { count: 'exact', head: true });
        if (error3) {
            console.error("❌ supporter_credits table check failed:", error3.message);
        } else {
            console.log("✅ supporter_credits table exists");
        }

        console.log("\n✅ Verification Complete. If all ticks are green, your database is ready.");
        console.log("ℹ️  Next step: Run the app and login to test User Sync.");

    } catch (err) {
        console.error("Unexpected error:", err);
    }
}

verify();
