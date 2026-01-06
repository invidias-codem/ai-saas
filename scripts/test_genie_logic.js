
// Mock dependencies
const mockGetChannelHistory = async (token, channel, limit) => {
    console.log(`[MOCK] Fetching history for channel ${channel} with limit ${limit}`);
    return {
        ok: true,
        messages: [
            { user: 'U1', text: 'Previous message 1' },
            { user: 'U2', text: 'Previous message 2' }
        ]
    };
};

const mockConfig = {
    botToken: 'mock-token',
    teamId: 'mock-team'
};

// Logic under test
async function testContextLogic(text) {
    console.log(`\nTesting text: "${text}"`);

    const cleanText = text.replace(/<@[A-Z0-9]+(\|[^>]+)?>/g, '').trim();
    const contextKeywords = ["context", "summary", "summarize", "catch up", "happened", "previous", "channel", "everyone", "vibe"];
    const needsContext = contextKeywords.some(keyword => cleanText.toLowerCase().includes(keyword));

    console.log(`- Needs Context: ${needsContext}`);

    if (needsContext) {
        const contextResult = await mockGetChannelHistory(mockConfig.botToken, 'C123', 15);
        if (contextResult.ok && contextResult.messages) {
            const contextMessages = contextResult.messages
                .map(m => `[${m.user}]: ${m.text}`)
                .join('\n');
            console.log(`- Context Injected:\n${contextMessages}`);
        }
    } else {
        console.log('- No context injected');
    }
}

// Run tests
async function run() {
    await testContextLogic("Hi Genie, what's up?");
    await testContextLogic("Genie, summarize the channel please.");
    await testContextLogic("Can you catch me up on what happened?");
    await testContextLogic("What is the vibe here?");
    await testContextLogic("Debug this code for me.");
}

run();
