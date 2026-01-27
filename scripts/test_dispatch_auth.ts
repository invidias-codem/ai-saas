import dotenv from 'dotenv';
import { CloudTasksClient } from '@google-cloud/tasks';
import fs from 'fs';

// Load env
if (fs.existsSync('.env.local')) {
    dotenv.config({ path: '.env.local' });
} else {
    dotenv.config();
}

async function main() {
    console.log("🚀 Testing Cloud Tasks Dispatch...");

    const project = process.env.GCP_PROJECT_ID;
    const queue = 'genie-worker-queue';
    const location = 'us-central1';
    const url = `https://${location}-${project}.cloudfunctions.net/genie-worker`;
    const serviceAccountEmail = process.env.GCP_SERVICE_ACCOUNT_EMAIL;

    console.log(`Config: Project=${project}, Queue=${queue}, Location=${location}, SA=${serviceAccountEmail}`);

    if (!project || !serviceAccountEmail) {
        console.error("❌ Missing env vars (GCP_PROJECT_ID or GCP_SERVICE_ACCOUNT_EMAIL)");
        process.exit(1);
    }

    // Client Init Logic (Mirrors route.ts)
    const options: any = {};
    if (process.env.GCP_SERVICE_ACCOUNT_KEY_JSON) {
        try {
            options.credentials = JSON.parse(process.env.GCP_SERVICE_ACCOUNT_KEY_JSON);
            console.log("✅ Loaded credentials from GCP_SERVICE_ACCOUNT_KEY_JSON");
        } catch (e) {
            console.error("❌ Failed to parse GCP_SERVICE_ACCOUNT_KEY_JSON", e);
        }
    } else {
        console.log("⚠️ No GCP_SERVICE_ACCOUNT_KEY_JSON found, falling back to ADC...");
    }

    try {
        const client = new CloudTasksClient(options);

        const parent = client.queuePath(project, location, queue);
        const task = {
            httpRequest: {
                httpMethod: 'POST' as const,
                url,
                oidcToken: {
                    serviceAccountEmail,
                },
                headers: {
                    'Content-Type': 'application/json',
                },
                body: Buffer.from(JSON.stringify({ prompt: "Test from Script", userId: "script-user" })).toString('base64'),
            },
        };

        console.log("📨 Enqueuing task...");
        const [response] = await client.createTask({ parent, task });
        console.log(`✅ Task created: ${response.name}`);
    } catch (error) {
        console.error("❌ Failed to create task:", error);
    }
}

main();
