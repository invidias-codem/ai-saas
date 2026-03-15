// app/api/debug-env/route.ts
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

export async function GET(req: Request) {
    if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Not available' }, { status: 404 });
    }

    try {
        // Only allow authenticated users
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Check critical environment variables (without exposing values)
        const envCheck = {
            GCP_PROJECT_ID: !!process.env.GCP_PROJECT_ID,
            GCP_TASK_QUEUE: !!process.env.GCP_TASK_QUEUE,
            GCP_REGION: !!process.env.GCP_REGION,
            GCP_WORKER_FUNCTION: !!process.env.GCP_WORKER_FUNCTION,
            GCP_SERVICE_ACCOUNT_EMAIL: !!process.env.GCP_SERVICE_ACCOUNT_EMAIL,
            GCP_SERVICE_ACCOUNT_KEY_JSON: !!process.env.GCP_SERVICE_ACCOUNT_KEY_JSON,
            NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
            SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        };

        return NextResponse.json({
            message: 'Environment check',
            env: envCheck,
            allPresent: Object.values(envCheck).every(v => v === true)
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
