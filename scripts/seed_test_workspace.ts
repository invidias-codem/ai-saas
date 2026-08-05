import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing Supabase env vars');
  process.exit(1);
}
const client = createClient(url, key);

(async () => {
  const { data: existing } = await client.from('workspaces').select('id').eq('id', '00000000-0000-0000-0000-000000000001').maybeSingle();
  if (existing?.id) {
    console.log('Workspace already exists');
    process.exit(0);
  }

  const { data: ws, error: wsError } = await client.from('workspaces').insert({
    id: '00000000-0000-0000-0000-000000000001',
    user_id: '00000000-0000-0000-0000-000000000000',
    name: 'Local Dev Workspace',
    slug: 'local-dev-workspace',
    description: 'Workspace used for local partner API task execution tests.',
    kind: 'personal',
    status: 'active',
    is_default: false,
    onboarding_state: 'active',
    routing_profile: {},
    memory_profile: {},
    last_opened_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).select('id').single();

  if (wsError) {
    console.error('Workspace insert failed:', wsError.message);
    process.exit(1);
  }

  console.log('Seeded workspace:', ws.id);
  process.exit(0);
})();
