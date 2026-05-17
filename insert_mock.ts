import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase
    .from('relay_commands')
    .insert([
      {
        user_id: '00000000-0000-0000-0000-000000000000',
        device_id: 'test-device',
        action_type: 'notify',
        payload: { message: 'Hello from final test!' },
        requires_approval: false,
        status: 'pending'
      }
    ]);
  if (error) console.error('Error:', error);
  else console.log('Success:', data);
}
run();
