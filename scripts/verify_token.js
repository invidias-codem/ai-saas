const https = require('https');
const fs = require('fs');
const path = require('path');

console.log('Starting verification script...');

try {
    const envPath = path.join(process.cwd(), '.env.local');
    if (fs.existsSync(envPath)) {
        console.log('Loading .env.local...');
        const envContent = fs.readFileSync(envPath, 'utf8');
        const lines = envContent.split(/\r?\n/);
        lines.forEach(line => {
            // robust matching for KEY=VAL, allowing quotes
            const match = line.match(/^\s*([\w_]+)\s*=\s*(.*)?\s*$/);
            if (match) {
                const key = match[1];
                let value = match[2] || '';
                // Remove surrounding quotes (single or double)
                if ((value.startsWith('"') && value.endsWith('"')) ||
                    (value.startsWith("'") && value.endsWith("'"))) {
                    value = value.slice(1, -1);
                }
                process.env[key] = value;
            }
        });
    } else {
        console.log('.env.local file NOT found at:', envPath);
    }
} catch (e) {
    console.error('Failed to load .env.local', e);
}

const token = process.env.SLACK_BOT_TOKEN;

console.log('Keys loaded:', Object.keys(process.env).filter(k => k.startsWith('SLACK')));

if (!token) {
    console.error('No SLACK_BOT_TOKEN found in .env.local');
    process.exit(1);
}

console.log('Token found. Testing against Slack API...');
// Basic masking for log security
console.log(`Token: ${token.substring(0, 5)}...${token.substring(token.length - 4)}`);

const options = {
    hostname: 'slack.com',
    path: '/api/auth.test',
    method: 'POST',
    headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    }
};

const req = https.request(options, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        console.log('Slack API Response:', data);
    });
});

req.on('error', (e) => {
    console.error('Request failed:', e);
});

req.end();
