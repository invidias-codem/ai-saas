
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

console.log('Verifying Environment Variables...');

const REQUIRED_VARS = [
    'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
    'CLERK_SECRET_KEY',
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY'
];

let hasError = false;

REQUIRED_VARS.forEach(key => {
    const value = process.env[key];
    if (!value) {
        console.error(`❌ MISSING: ${key}`);
        hasError = true;
    } else {
        console.log(`✅ PRESENT: ${key} (Length: ${value.length})`);
        if (key.includes('URL') && !value.startsWith('http')) {
            console.warn(`⚠️ WARNING: ${key} does not look like a URL`);
        }
    }
});

if (hasError) {
    console.error('FAILED: Missing required environment variables.');
    process.exit(1);
} else {
    console.log('SUCCESS: All required variables are present.');
}
