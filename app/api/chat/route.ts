// app/api/chat/route.ts
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { CloudTasksClient } from '@google-cloud/tasks';
import { supabaseAdmin } from '@/lib/supabaseClient';

// Lazy-initialized singleton
let tasksClient: CloudTasksClient | null = null;

function getTasksClient(): CloudTasksClient {
    if (!tasksClient) {
        try {
            const credentialsJson = process.env.GCP_SERVICE_ACCOUNT_KEY_JSON;
            const options: any = {};

            if (credentialsJson) {
                options.credentials = JSON.parse(credentialsJson);
            }

            tasksClient = new CloudTasksClient(options);
        } catch (error) {
            console.error('Failed to initialize CloudTasksClient:', error);
            throw new Error('Cloud Tasks client initialization failed. Check GCP credentials.');
        }
    }
    return tasksClient;
}

export async function POST(req: Request) {
    try {
        // 1. Authenticate User
        const { userId: authenticatedUserId } = auth();
        if (!authenticatedUserId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // 2. Validate Input
        const body = await req.json();
        const { prompt, conversationId, fileData } = body;

        if (!prompt) return NextResponse.json({ error: 'Missing prompt' }, { status: 400 });

        // Use authenticated userId instead of client-provided one
        const userId = authenticatedUserId;

        // 3. Construct the Cloud Task
        const project = process.env.GCP_PROJECT_ID;
        const queue = process.env.GCP_TASK_QUEUE || 'genie-worker-queue';
        const location = process.env.GCP_REGION || 'us-central1';
        const workerFunctionName = process.env.GCP_WORKER_FUNCTION || 'genie-worker';
        const url = `https://${location}-${project}.cloudfunctions.net/${workerFunctionName}`;
        const serviceAccountEmail = process.env.GCP_SERVICE_ACCOUNT_EMAIL;

        // Check for critical variables
        if (!project || !serviceAccountEmail) {
            console.error("Missing GCP_PROJECT_ID or GCP_SERVICE_ACCOUNT_EMAIL");
            return NextResponse.json({ error: 'Configuration Error' }, { status: 500 });
        }

        // 2.5 Persist USER Message to Supabase (Prevent data loss)
        if (conversationId && supabaseAdmin) {
            try {
                const { error: dbError } = await supabaseAdmin
                    .from('messages')
                    .insert({
                        conversation_id: conversationId,
                        role: 'user',
                        content: prompt
                    });

                if (dbError) {
                    console.error("Failed to persist user message:", dbError.message, dbError.details);
                    // We continue anyway so the agent still runs, but warn.
                } else {
                    console.log(`[Dispatcher] Persisted user message for conv ${conversationId}`);
                }
            } catch (err) {
                console.error("Dispatcher DB Write Error:", err);
            }
        }

        const client = getTasksClient();
        const parent = client.queuePath(project, location, queue);

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
                body: Buffer.from(JSON.stringify({
                    prompt,
                    userId,
                    conversationId,
                    fileData // Forward file data (base64)
                })).toString('base64'),
            },
        };

        // 4. Dispatch and Forget (Async)
        // We await the *creation* of the task, not the *execution*
        console.log(`[Dispatcher] Creating task for conv ${conversationId}, queue: ${parent}`);
        try {
            const response = await client.createTask({ parent: parent, task });
            console.log(`[Dispatcher] ✅ Task created successfully:`, response[0]?.name);
        } catch (taskError: any) {
            console.error(`[Dispatcher] ❌ Failed to create task:`, taskError.message, taskError.details);
            // Return error to user instead of silently failing
            return NextResponse.json({
                error: 'Failed to queue AI request',
                details: taskError.message
            }, { status: 500 });
        }

        // 5. Return Immediate UI Feedback
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
