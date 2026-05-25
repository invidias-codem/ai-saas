import { supabaseAdmin } from './lib/supabaseClient';

async function main() {
    const { data } = await supabaseAdmin.from('workspaces').select('*').limit(1);
    console.log(data);
}
main();
