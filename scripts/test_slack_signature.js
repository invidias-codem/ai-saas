const crypto = require('crypto');
const http = require('http');
const https = require('https');

// Config
const TARGET_URL = 'http://localhost:3000/api/integrations/slack/events';
const SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET || 'test_secret';

if (!process.env.SLACK_SIGNING_SECRET) {
    console.warn("⚠️ SLACK_SIGNING_SECRET not set in env. Using 'test_secret' - this will fail if server has a different secret.");
}

function sendRequest(body, headers) {
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

async function runTests() {
    console.log(`Testing Slack Signature Verification against ${TARGET_URL}\n`);

    const body = { type: 'url_verification', challenge: 'test_challenge', token: 'test_token' };
    const timestamp = Math.floor(Date.now() / 1000);

    // Test 1: Valid Signature
    console.log("Test 1: Valid Signature");
    const validSig = createSignature(body, timestamp, SIGNING_SECRET);
    try {
        const res1 = await sendRequest(body, {
            'x-slack-request-timestamp': timestamp,
            'x-slack-signature': validSig
        });
        if (res1.status === 200) console.log("✅ Passed (Status 200)");
        else console.log(`❌ Failed (Status ${res1.status} - expected 200)`);
    } catch (e) {
        console.log(`❌ Connection Error:Is the server running? (${e.message})`);
    }

    // Test 2: Invalid Signature
    console.log("\nTest 2: Invalid Signature");
    const invalidSig = "v0=invalid_hash_1234567890abcdef";
    try {
        const res2 = await sendRequest(body, {
            'x-slack-request-timestamp': timestamp,
            'x-slack-signature': invalidSig
        });
        if (res2.status === 401) console.log("✅ Passed (Status 401)");
        else console.log(`❌ Failed (Status ${res2.status} - expected 401)`);
    } catch (e) {
        console.log(`❌ Connection Error:Is the server running? (${e.message})`);
    }

    // Test 3: Missing Signature
    console.log("\nTest 3: Missing Signature");
    try {
        const res3 = await sendRequest(body, {
            'x-slack-request-timestamp': timestamp
        });
        if (res3.status === 401) console.log("✅ Passed (Status 401)");
        else console.log(`❌ Failed (Status ${res3.status} - expected 401)`);
    } catch (e) {
        console.log(`❌ Connection Error:Is the server running? (${e.message})`);
    }
}

runTests();
