
import { createClient } from '@supabase/supabase-js';

// Retrieve credentials from environment variables
// Note: In Next.js, use process.env.NEXT_PUBLIC_... for client-side keys if needed, 
// but for RAG/Memory, we prefer server-side operations with the Service Role Key if possible,
// or at least the anon key with proper RLS.
// Retreive credentials
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || (!supabaseAnonKey && !supabaseServiceKey)) {
    console.warn('⚠️ Supabase credentials missing. RAG features will be disabled.');
} else if (supabaseServiceKey?.startsWith('sb_publishable')) {
    console.warn('⚠️ WARNING: SUPABASE_SERVICE_ROLE_KEY in .env.local appears to be a publishable key. Backend routes using this key will be subject to Row Level Security (RLS) and may fail. Please use the SERVICE_ROLE secret key (starts with sb_secret_ or ey...) for full backend access.');
}

// Default client (Server-side: uses Service Role if available for full access)
// Client-side: uses Anon key (Service Role is undefined in browser)
const supabaseKey = (typeof window === 'undefined' && supabaseServiceKey)
    ? supabaseServiceKey
    : supabaseAnonKey;

export const supabase = (supabaseUrl && supabaseKey)
    ? createClient(supabaseUrl, supabaseKey)
    : {
        from: () => ({
            select: () => ({ eq: () => ({ single: () => ({ data: null, error: 'Supabase not configured' }), order: () => ({ limit: () => ({ single: () => ({ data: null }) }) }) }) }),
            insert: () => ({ select: () => ({ single: () => ({ data: null, error: 'Supabase not configured' }) }) }),
        }),
        rpc: () => ({ data: [], error: 'Supabase not configured' }),
        channel: () => ({
            on: () => ({ subscribe: () => { } }),
            subscribe: () => { }
        })
    } as any;

// Explicit Admin Client (for clear usage in backend routes)
export const supabaseAdmin = (supabaseUrl && supabaseServiceKey)
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null; // Do not fallback to anon client, as this hides configuration errors and causes RLS issues

// ── Sovereign AI Telemetry dedicated instance (Q3 DECIDED 2026-07-12) ──
// Telemetry is written to a STRICTLY ISOLATED Supabase instance so high-volume
// multi-agent audit writes cannot starve the main transactional DB (auth,
// payments, core logic). Separate env vars; null when not configured.
const telemetryUrl = process.env.SUPABASE_TELEMETRY_URL;
const telemetryServiceKey = process.env.SUPABASE_TELEMETRY_SERVICE_ROLE;

export const supabaseTelemetryAdmin = (telemetryUrl && telemetryServiceKey)
  ? createClient(telemetryUrl, telemetryServiceKey)
  : null;


