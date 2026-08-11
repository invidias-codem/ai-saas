import { NextResponse } from 'next/server';
import { requireCronAuth } from '@/lib/security/cronAuth';

export async function GET(req: Request) {
    const authFailure = requireCronAuth(req, { routeName: 'BlogWeeklyCron' });
    if (authFailure) return authFailure;

    if (process.env.CRON_SECRET && req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://ai-saas-9pymfg87g-invidias-codems-projects.vercel.app';
    const taskEndpoint = `${baseUrl}/api/v1/tasks`;

    const payload = {
        task_type: 'blog_post',
        input: 'weekly blog post: write about Lattice OS progress and relevant AI news',
        context: {
            source: 'vercel-cron',
            schedule: 'weekly',
        },
    };

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(taskEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.CRON_SECRET}`,
                'x-cron-blog': '1',
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const text = await response.text();
            console.error('[BlogWeeklyCron] Task creation failed:', response.status, text);
            return NextResponse.json({ success: false, error: `Task creation failed: ${response.status}` }, { status: 502 });
        }

        const data = await response.json();
        console.log('[BlogWeeklyCron] Task queued:', JSON.stringify(data));
        return NextResponse.json({ success: true, task: data });
    } catch (error: any) {
        console.error('[BlogWeeklyCron] Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
