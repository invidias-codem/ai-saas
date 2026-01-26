// app/api/chat/route.ts
import { NextResponse } from 'next/server';
import { CloudTasksClient } from '@google-cloud/tasks';

// Initialize Client (Lazy load outside handler for performance)
const tasksClient = new CloudTasksClient();

export async function POST(req: Request) {
    try {
        // 1. Validate Input
        const body = await req.json();
        const { prompt, userId } = body;

        if (!prompt) return NextResponse.json({ error: 'Missing prompt' }, { status: 400 });

        // 2. Construct the Cloud Task
        const project = process.env.GCP_PROJECT_ID;
        const queue = 'genie-worker-queue';
        const location = 'us-central1';
        const url = 'https://us-central1-genie-ai-1ca85.cloudfunctions.net/genie-worker';
        const serviceAccountEmail = process.env.GCP_SERVICE_ACCOUNT_EMAIL;

        // Check for critical variables
        if (!project || !serviceAccountEmail) {
            console.error("Missing GCP_PROJECT_ID or GCP_SERVICE_ACCOUNT_EMAIL");
            return NextResponse.json({ error: 'Configuration Error' }, { status: 500 });
        }

        const parent = tasksClient.queuePath(project, location, queue);

        const task = {
            httpRequest: {
                httpMethod: 'POST' as const,
                url,
                // OIDC Token ensures only YOUR Next.js app can trigger this function
                oidcToken: {
                    serviceAccountEmail,
                },
                headers: {
                    'Content-Type': 'application/json',
                },
                body: Buffer.from(JSON.stringify({ prompt, userId })).toString('base64'),
            },
        };

        // 3. Dispatch and Forget (Async)
        // We await the *creation* of the task, not the *execution*
        await tasksClient.createTask({ parent, task });

        // 4. Return Immediate UI Feedback
        return NextResponse.json({
            status: 'queued',
            message: 'Agent is thinking...',
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Dispatcher Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
