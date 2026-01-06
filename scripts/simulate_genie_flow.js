const crypto = require('crypto');
const http = require('http');
const https = require('https');

// Config
const TARGET_URL = 'http://localhost:3000/api/integrations/slack/events';
const SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET || 'test_secret';

// Use command line arg for text or default
const USER_TEXT = process.argv[2] || "Genie, summarize this channel";

async function sendRequest(body, headers) {
    return new Promise((resolve, reject) => {
        const url = new URL(TARGET_URL);
        const options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...headers
            }
        };

        const req = (url.protocol === 'https:' ? https : http).request(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, data }));
        });

        req.on('error', reject);
        req.write(JSON.stringify(body));
        req.end();
    });
}

function createSignature(body, timestamp, secret) {
    const baseString = `v0:${timestamp}:${JSON.stringify(body)}`;
    const hmac = crypto.createHmac('sha256', secret).update(baseString).digest('hex');
    return `v0=${hmac}`;
}

async function runSimulation() {
    console.log(`🤖 Simulating 'app_mention' event to ${TARGET_URL}`);
    console.log(`💬 User says: "${USER_TEXT}"\n`);

    const timestamp = Math.floor(Date.now() / 1000);

    // Construct a realistic app_mention payload
    const payload = {
        token: "mock_token",
        team_id: "T123456",
        api_app_id: "A123456",
        event: {
            type: "app_mention",
            user: "U123456",
            text: `<@U0123456> ${USER_TEXT}`, // Standard mention format
            ts: `${timestamp}.123456`,
            channel: "C123456",
            event_ts: `${timestamp}.123456`
        },
        type: "event_callback",
        event_id: `Ev${timestamp}`,
        event_time: timestamp
    };

    const signature = createSignature(payload, timestamp, SIGNING_SECRET);

    try {
        console.log("🚀 Sending request...");
        const res = await sendRequest(payload, {
            'x-slack-request-timestamp': timestamp,
            'x-slack-signature': signature
        });

        console.log(`\n📥 Response Status: ${res.status}`);

        if (res.status === 200) {
            console.log("✅ Success! The server accepted the event.");
            console.log("Response Data:", res.data);
            console.log("\n⚠️ NOTE: Since the server processes the LLM response asynchronously (and sends it back to Slack API via fetch), you won't see the AI's response text here.");
            console.log("   Check the server logs (terminal) to see the processing logic and the final call to 'chat.postMessage'.");
        } else {
            console.log("❌ Failed to process event.");
            console.log("Error:", res.data);
        }

    } catch (e) {
        console.log(`❌ Connection Error: Is the local server running?`);
        console.log(`   Run 'npm run dev' in another terminal.\n   Error: ${e.message}`);
    }
}

runSimulation();
