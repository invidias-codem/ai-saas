
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

console.log('Verifying Key Formats...');

const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const CLERK_KEY = process.env.CLERK_SECRET_KEY || '';

if (SUPABASE_KEY.startsWith('eyJ')) {
    console.log('✅ Supabase Key looks like a JWT');
} else {
    console.error('❌ Supabase Key DOES NOT start with "eyJ". It might be a password or invalid string.');
    console.log(`First 3 chars: ${SUPABASE_KEY.substring(0, 3)}`);
}

if (CLERK_KEY.startsWith('sk_')) {
    console.log('✅ Clerk Secret Key starts with "sk_"');
} else {
    console.error('❌ Clerk Secret Key DOES NOT start with "sk_".');
    console.log(`First 3 chars: ${CLERK_KEY.substring(0, 3)}`);
}
