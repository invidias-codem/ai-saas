import http from 'http';
import { execFileSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

// Setup __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load Environment Variables
const rootDir = process.cwd();
if (fs.existsSync(path.join(rootDir, '.env.local'))) {
    dotenv.config({ path: path.join(rootDir, '.env.local') });
    console.log('✅ Loaded .env.local');
} else {
    dotenv.config();
}

const PORT = 3000;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API_URL = `https://api.telegram.org/bot${BOT_TOKEN}`;
const AUTH_PHONE = process.env.TELEGRAM_AUTHORIZED_PHONE?.replace('+', '');
const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID ? String(process.env.TELEGRAM_ADMIN_CHAT_ID) : null;

// Ensure temp directory exists for plans
const TMP_DIR = path.join(rootDir, '.agent', 'temp');
if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
}

if (!BOT_TOKEN) {
    console.error('❌ Error: TELEGRAM_BOT_TOKEN is missing in environment.');
    process.exit(1);
}

// Helper Functions
async function sendMessage(chatId, text, replyMarkup) {
    try {
        await fetch(`${API_URL}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: text,
                parse_mode: 'Markdown',
                reply_markup: replyMarkup
            })
        });
    } catch (e) {
        console.error('Failed to send message:', e.message);
    }
}

async function sendChatAction(chatId, action = 'typing') {
    try {
        await fetch(`${API_URL}/sendChatAction`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, action })
        });
    } catch (e) {
        console.error('Failed to send action:', e.message);
    }
}

// Request Handler
const requestHandler = async (req, res) => {
    // Only accept POST to the webhook endpoint
    if (req.method !== 'POST') {
        res.writeHead(405);
        res.end('Method Not Allowed');
        return;
    }

    if (req.url !== '/api/integrations/telegram/webhook') {
        console.log(`⚠️ Received request at ${req.url} - Ignoring (expecting /api/integrations/telegram/webhook)`);
        res.writeHead(404);
        res.end('Not Found');
        return;
    }

    console.log('[TELEGRAM] Request received');

    // Read Body
    let bodyText = '';
    req.on('data', chunk => {
        bodyText += chunk.toString();
    });

    req.on('end', async () => {
        try {
            if (!bodyText) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true }));
                return;
            }

            const update = JSON.parse(bodyText);
            console.log('[TELEGRAM] Update:', JSON.stringify(update, null, 2));

            // 1. Handle Messages
            if (update.message) {
                const chatId = update.message.chat.id;
                const text = update.message.text || '';

                // --- AUTH CHECK: CONTACT SHARE ---
                if (update.message.contact) {
                    const sharedPhone = update.message.contact.phone_number.replace('+', '');

                    if (AUTH_PHONE && sharedPhone === AUTH_PHONE) {
                        await sendMessage(chatId, `✅ **Identity Verified!**\n\nYour Phone: \`${sharedPhone}\` matches authorized user.\n\n⚠️ **One-time Setup:**\nPlease add this to your \`.env.local\` to enable commands:\n\`TELEGRAM_ADMIN_CHAT_ID=${chatId}\``);
                    } else {
                        await sendMessage(chatId, `❌ **Unauthorized Phone:** \`${sharedPhone}\`\nAllowed: \`${AUTH_PHONE}\``);
                    }
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ ok: true }));
                    return;
                }

                // --- SECURITY CHECK ---
                if (!ADMIN_CHAT_ID || String(chatId) !== ADMIN_CHAT_ID) {
                    if (ADMIN_CHAT_ID) {
                        // Forward to Admin (Support Ticket logic)
                        const sender = update.message.from;
                        const senderName = sender.first_name + (sender.username ? ` (@${sender.username})` : '');
                        const ticketMsg = `📩 **New Support Ticket**\nFrom: ${senderName} \`[${chatId}]\`\n\n"${text}"\n\nTo reply: \`/reply ${chatId} <message>\``;
                        await sendMessage(parseInt(ADMIN_CHAT_ID), ticketMsg);
                        await sendMessage(chatId, "Thank you for your message! 📨\nOur support team has received your inquiry and will respond shortly via this chat.");
                    } else {
                        await sendMessage(chatId, "System Log: Bot is not fully configured (Missing Admin ID).");
                    }
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ ok: true }));
                    return;
                }

                // --- COMMANDS ---
                if (text.startsWith('/reply ')) {
                    const parts = text.split(' ');
                    if (parts.length < 3) {
                        await sendMessage(chatId, "Usage: `/reply <userId> <message>`");
                    } else {
                        const targetId = parts[1];
                        const replyText = parts.slice(2).join(' ');
                        await sendMessage(parseInt(targetId), `👨‍💻 **Support:**\n${replyText}`);
                        await sendMessage(chatId, `✅ Reply sent to ${targetId}.`);
                    }

                } else if (text.startsWith('/engineer')) {
                    const task = text.replace('/engineer', '').trim();
                    if (!task) {
                        await sendMessage(chatId, "🦞 **Genie Engineer**\n\nPlease describe a task: `/engineer Update the readme`");
                    } else {
                        await sendMessage(chatId, "🦞 **Planning task...**");
                        await sendChatAction(chatId, 'typing');

                        try {
                            const scriptPath = path.join(process.cwd(), '.agent/skills/genie-context/scripts/engineer.mjs');
                            const output = execFileSync('node', [scriptPath, task, '--plan-only'], {
                                encoding: 'utf-8',
                                env: { ...process.env, GOOGLE_API_KEY: process.env.GOOGLE_API_KEY }
                            });

                            const jsonMatch = output.match(/---JSON_START---([\s\S]*?)---JSON_END---/);
                            if (!jsonMatch) throw new Error("Could not parse engineer plan.");

                            const plan = JSON.parse(jsonMatch[1]);
                            const planDesc = plan.plan || "Complexity unknown";
                            const steps = plan.steps || [];
                            const summary = `**Plan Proposed:**\n${planDesc}\n\n**Steps:**\n` + steps.map((s, i) => `${i + 1}. ${s.type === 'write' ? '📝 Write' : '💻 Run'} \`${s.path || s.command}\``).join('\n');

                            await sendMessage(chatId, summary, {
                                inline_keyboard: [
                                    [{ text: "✅ Approve (Run Locally)", callback_data: `APPROVE_PLAN` }],
                                    [
                                        { text: "🔄 Retry", callback_data: "RETRY_PLAN" },
                                        { text: "❌ Cancel", callback_data: "CANCEL" }
                                    ]
                                ]
                            });

                            // Save plan to loose temp file
                            const tmpPath = path.join(TMP_DIR, 'latest_plan.json');
                            fs.writeFileSync(tmpPath, JSON.stringify({ task, plan }));
                        } catch (e) {
                            await sendMessage(chatId, `❌ **Error:** ${e.message}`);
                        }
                    }
                } else if (text.startsWith('/blog')) {
                    const topic = text.replace('/blog', '').trim();
                    if (!topic) {
                        await sendMessage(chatId, "✍️ **Genie Blogger**\n\nPlease provide a topic: `/blog The Future of AI`");
                    } else {
                        await sendMessage(chatId, "✍️ **Drafting blog post...**");
                        await sendChatAction(chatId, 'typing');

                        try {
                            const today = new Date().toISOString().split('T')[0]; // "2026-02-03"
                            const task = `Write a high-quality blog post about "${topic}" in content/blog/. IMPORTANT: Use this exact frontmatter with publishedAt: "${today}", author: "genie-team", and category: "engineering". Quote any title/description values that contain colons. Use the existing MDX files as a reference for style. Create a new file with a kebab-case filename. Ensure the content is engaging and technical.`;

                            const scriptPath = path.join(process.cwd(), '.agent/skills/genie-context/scripts/engineer.mjs');
                            const output = execFileSync('node', [scriptPath, task, '--plan-only'], {
                                encoding: 'utf-8',
                                env: { ...process.env, GOOGLE_API_KEY: process.env.GOOGLE_API_KEY }
                            });

                            const jsonMatch = output.match(/---JSON_START---([\s\S]*?)---JSON_END---/);
                            if (!jsonMatch) throw new Error("Could not parse blog plan.");

                            const plan = JSON.parse(jsonMatch[1]);
                            const planDesc = plan.plan || "Complexity unknown";
                            const steps = plan.steps || [];
                            const summary = `**Blog Draft Ready:**\n${planDesc}\n\n**Steps:**\n` + steps.map((s, i) => `${i + 1}. ${s.type === 'write' ? '📝 Create' : '💻 Run'} \`${s.path || s.command}\``).join('\n');

                            await sendMessage(chatId, summary, {
                                inline_keyboard: [
                                    [{ text: "✅ Publish (Commit & Push)", callback_data: `APPROVE_PLAN` }],
                                    [
                                        { text: "🔄 Retry", callback_data: "RETRY_PLAN" },
                                        { text: "❌ Cancel", callback_data: "CANCEL" }
                                    ]
                                ]
                            });

                            // Save plan to loose temp file (stateless)
                            const tmpPath = path.join(TMP_DIR, 'latest_plan.json');
                            fs.writeFileSync(tmpPath, JSON.stringify({ task, plan }));

                        } catch (e) {
                            await sendMessage(chatId, `❌ **Error:** ${e.message}`);
                        }
                    }
                } else {
                    await sendMessage(chatId, `🤖 I didn't understand that.\nCommands:\n\`/engineer <task>\` - Autonomous coding\n\`/blog <topic>\` - Write a blog post\n\`/reply <id> <msg>\` - Reply to support`);
                }
            }

            // 2. Handle Callbacks
            if (update.callback_query) {
                const chatId = update.callback_query.message.chat.id;
                const data = update.callback_query.data;

                if (data === 'CANCEL') {
                    await sendMessage(chatId, "🚫 **Task Cancelled.**");
                } else if (data === 'APPROVE_PLAN') {
                    await sendMessage(chatId, "🛠️ **Executing Plan Locally...**");
                    await sendChatAction(chatId, 'typing');

                    const tmpPath = path.join(TMP_DIR, 'latest_plan.json');
                    if (fs.existsSync(tmpPath)) {
                        try {
                            const scriptPath = path.join(process.cwd(), '.agent/skills/genie-context/scripts/engineer.mjs');
                            execFileSync('node', [scriptPath, 'EXECUTE', '--plan-file', tmpPath], {
                                encoding: 'utf-8',
                                env: { ...process.env }
                            });

                            const branchName = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
                            await sendMessage(chatId, `✅ **Local Execution Complete!**\nBranch: \`${branchName}\`\n\nReady to push to GitHub?`, {
                                inline_keyboard: [[{ text: "🚀 Push & Open PR", callback_data: "PUSH_PR" }]]
                            });
                        } catch (e) {
                            await sendMessage(chatId, `❌ **Execution Failed:** ${e.message}`);
                        }
                    } else {
                        await sendMessage(chatId, "⚠️ Plan expired. Run /engineer again.");
                    }
                } else if (data === 'PUSH_PR') {
                    await sendMessage(chatId, "🚀 **Pushing to GitHub...**");
                    try {
                        const branchName = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
                        execSync(`git push -u origin ${branchName}`, { encoding: 'utf-8' });
                        const prUrl = `https://github.com/invidias-codem/ai-saas/compare/main...${branchName}?expand=1`;
                        await sendMessage(chatId, `✅ **Pushed Successfully!**\n\nClick below to open PR:\n\n[🔗 Create Pull Request](${prUrl})`, {
                            disable_web_page_preview: true
                        });
                    } catch (e) {
                        await sendMessage(chatId, `❌ **Push Failed:** ${e.message}`);
                    }
                }
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));

        } catch (e) {
            console.error('Processing Error:', e);
            res.writeHead(500);
            res.end(JSON.stringify({ error: e.message }));
        }
    });
};

// Start Server
const server = http.createServer(requestHandler);

server.listen(PORT, () => {
    console.log(`\n🤖 Telegram Bot Standalone Server is running!`);
    console.log(`📍 Listening on port: ${PORT}`);
    console.log(`🔗 Webhook Path: /api/integrations/telegram/webhook`);
    console.log(`\nMake sure ngrok is forwarding to this port:`);
    console.log(`👉 ngrok http ${PORT}`);
});
