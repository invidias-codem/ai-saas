
const fetch = require('node-fetch'); // Ensure node-fetch is available or use global fetch if Node 18+

async function simulateEvent() {
    const teamId = 'T09PBMA9QP6'; // Extracted from user logs

    const payload = {
        token: 'mock-token',
        team_id: teamId,
        api_app_id: 'A012345678',
        event: {
            client_msg_id: 'test-msg-id',
            type: 'app_mention',
            text: '<@U09UD3YN53K> hello test', // Using a placeholder bot ID
            user: 'U09PBPEUKE0', // Placeholder user
            ts: Date.now().toString(),
            channel: 'D09UD3Z2ZT3', // Real DM Channel from logs
            event_ts: Date.now().toString(),
        },
        type: 'event_callback',
        event_id: 'Ev012345678',
        event_time: Math.floor(Date.now() / 1000),
        authed_users: ['U09UD3YN53K']
    };

    console.log('Sending mock Slack event:', JSON.stringify(payload, null, 2));

    try {
        const response = await fetch('http://localhost:3000/api/integrations/slack/events', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        });

        console.log('Response Status:', response.status);
        const text = await response.text();
        console.log('Response Body:', text);
    } catch (error) {
        console.error('Error sending request:', error);
    }
}

simulateEvent();
