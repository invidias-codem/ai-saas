
import { createClient } from '@supabase/supabase-js';

// Retrieve credentials from environment variables
// Note: In Next.js, use process.env.NEXT_PUBLIC_... for client-side keys if needed, 
// but for RAG/Memory, we prefer server-side operations with the Service Role Key if possible,
// or at least the anon key with proper RLS.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.warn('⚠️ Supabase credentials missing. RAG features will be disabled.');
}

// Export a robust client that handles missing config
export const supabase = (supabaseUrl && supabaseKey)
    ? createClient(supabaseUrl, supabaseKey)
    : {
        from: () => ({
            select: () => ({ eq: () => ({ single: () => ({ data: null, error: 'Supabase not configured' }), order: () => ({ limit: () => ({ single: () => ({ data: null }) }) }) }) }),
            insert: () => ({ select: () => ({ single: () => ({ data: null, error: 'Supabase not configured' }) }) }),
        }),
        rpc: () => ({ data: [], error: 'Supabase not configured' })
    } as any;

