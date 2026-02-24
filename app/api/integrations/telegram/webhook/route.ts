
import { NextResponse } from 'next/server';
import { execFileSync } from 'child_process';
import path from 'path';

// Types for Telegram Updates
interface TelegramUpdate {
    update_id: number;
    message?: {
        message_id: number;
        from: TelegramUser;
        chat: TelegramChat;
        text?: string;
        contact?: {
            phone_number: string;
            user_id: number;
        };
    };
    callback_query?: {
        id: string;
        from: TelegramUser;
        message: {
            message_id: number;
            chat: TelegramChat;
        };
        data: string;
    };
}

interface TelegramUser {
    id: number;
    is_bot: boolean;
    first_name: string;
    username?: string;
}

interface TelegramChat {
    id: number;
    type: string;
}

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const AUTH_PHONE = process.env.TELEGRAM_AUTHORIZED_PHONE?.replace('+', ''); // Normalize
const API_URL = `https://api.telegram.org/bot${BOT_TOKEN}`;

/**
 * Send a message to a Telegram User
 */
async function sendMessage(chatId: number, text: string, replyMarkup?: any) {
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
}

/**
 * Send a generic typing action (helpful for long running tasks)
 */
async function sendChatAction(chatId: number, action: string = 'typing') {
    await fetch(`${API_URL}/sendChatAction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, action })
    });
}

/**
 * Handle incoming Telegram Webhook
 */
export async function POST(req: Request) {
    console.log('[TELEGRAM] Webhook received'); // Debug log

    if (!BOT_TOKEN) {
        console.error('[TELEGRAM] Error: BOT_TOKEN is missing');
        return NextResponse.json({ error: 'Config missing' }, { status: 500 });
    }

    try {
        const bodyText = await req.text();
        console.log('[TELEGRAM] Body:', bodyText);

        if (!bodyText) return NextResponse.json({ ok: true });

        const update: TelegramUpdate = JSON.parse(bodyText);
        console.log('[TELEGRAM] Parsed update:', JSON.stringify(update, null, 2));

        // 1. Handle Messages
        if (update.message) {
            const chatId = update.message.chat.id;
            const text = update.message.text || '';

            // --- AUTH CHECK: CONTACT SHARE ---
            if (update.message.contact) {
                const sharedPhone = update.message.contact.phone_number.replace('+', '');

                if (AUTH_PHONE && sharedPhone === AUTH_PHONE) {
                    // Correct user
                    // We can verify user_id here but simpler to just authorize the session/chat_id concept implicitly for now.
                    // In a real app we'd store the allowed Chat ID in DB.
                    // For now, we will verify phone on every "contact" share, but for commands we verify sender?
                    // Actually, since Telegram doesn't send "contact" on every message, we need to know if this Chat ID is authorized.
                    // But for statelesness in this simple implementation, we can just enforce "Sender ID" if we knew it?
                    // No, let's keep it simple: WE TRUST THE SENDER ID if verified? 
                    // We need a lightweight way to persist "This chat ID is admin".
                    // Since we don't have a DB handy for this specific small integration, 
                    // we will just Ask for Contact if we don't recognize them? 
                    // Or better: The user just hits "Start". We ask for Contact. 
                    // If valid, we say "You are authorized." 
                    // AND FOR FUTURE COMMANDS? 
                    // We can check `update.message.from.id`? No, phone number is only sent in Contact message.

                    // IMPACT: We should likely store the authorized Chat ID in a simple file or just require "Share Contact" to "Login" per session?
                    // Let's rely on a "secret" command or just trust the phone number verification step.
                    // To keep it strictly cost-effective and stateless:
                    // We'll require a "Login" flow where they share contact.
                    // Then we could issue a JWT? No that's complex for Telegram.

                    // Simplest Secure Approach:
                    // 1. User sends /engineer ...
                    // 2. Logic checks if `chat_id` is in a list of allowed IDs?
                    // Problem: We don't have persistent list.

                    // Okay, look at the prompt requirements: "cost effectively run genie".
                    // We'll use a hardcoded "Admin Chat ID" in ENV if possible?
                    // But we don't know it yet.

                    // Solution:
                    // User shares contact. If match, print "Your Chat ID is XXXXX. Please add TELEGRAM_ADMIN_CHAT_ID=XXXXX to .env.local".
                    // This is secure and one-time setup.
                    await sendMessage(chatId, `✅ **Identity Verified!**\n\nYour Phone: \`${sharedPhone}\` matches authorized user.\n\n⚠️ **One-time Setup:**\nPlease add this to your \`.env.local\` to enable commands:\n\`TELEGRAM_ADMIN_CHAT_ID=${chatId}\``);
                } else {
                    await sendMessage(chatId, `❌ **Unauthorized Phone:** \`${sharedPhone}\`\nAllowed: \`${AUTH_PHONE}\``);
                }
                return NextResponse.json({ ok: true });
            }

            // --- SECURITY & SUPPORT GATE ---
            const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID;

            // If user is NOT admin
            if (!ADMIN_CHAT_ID || String(chatId) !== ADMIN_CHAT_ID) {
                // If they are trying to verify, let them (handled above in 'contact')

                // Otherwise, treat as SUPPORT TICKET
                if (ADMIN_CHAT_ID) {
                    // Forward to Admin
                    const sender = update.message!.from;
                    const senderName = sender.first_name + (sender.username ? ` (@${sender.username})` : '');
                    const ticketMsg = `📩 **New Support Ticket**\nFrom: ${senderName} \`[${chatId}]\`\n\n"${text}"\n\nTo reply: \`/reply ${chatId} <message>\``;
                    await sendMessage(parseInt(ADMIN_CHAT_ID), ticketMsg);

                    // Reply to User
                    await sendMessage(chatId, "Thank you for your message! 📨\nOur support team has received your inquiry and will respond shortly via this chat.");
                } else {
                    await sendMessage(chatId, "System Log: Bot is not fully configured (Missing Admin ID).");
                }
                return NextResponse.json({ ok: true });
            }

            // --- ADMIN COMMANDS ---
            if (text.startsWith('/reply ')) {
                // Format: /reply <chatId> <message>
                const parts = text.split(' ');
                if (parts.length < 3) {
                    await sendMessage(chatId, "Usage: `/reply <userId> <message>`");
                    return NextResponse.json({ ok: true });
                }
                const targetId = parts[1];
                const replyText = parts.slice(2).join(' ');

                await sendMessage(parseInt(targetId), `👨‍💻 **Support:**\n${replyText}`);
                await sendMessage(chatId, `✅ Reply sent to ${targetId}.`);

            } else if (text.startsWith('/engineer')) {
                const task = text.replace('/engineer', '').trim();
                if (!task) {
                    await sendMessage(chatId, "🦞 **Genie Engineer**\n\nPlease describe a task: `/engineer Update the readme`");
                    return NextResponse.json({ ok: true });
                }

                await sendMessage(chatId, "🦞 **Planning task...**");
                await sendChatAction(chatId, 'typing');

                try {
                    const scriptPath = path.join(process.cwd(), '.agent/skills/genie-context/scripts/engineer.mjs');
                    // Run plan
                    const output = execFileSync('node', [scriptPath, task, '--plan-only'], {
                        encoding: 'utf-8',
                        env: { ...process.env, GOOGLE_API_KEY: process.env.GOOGLE_API_KEY } // Ensure keys are passed
                    });

                    // Extract JSON
                    const jsonMatch = output.match(/---JSON_START---([\s\S]*?)---JSON_END---/);
                    if (!jsonMatch) throw new Error("Could not parse engineer plan.");

                    const plan = JSON.parse(jsonMatch[1]);
                    const planDesc = plan.plan || "Complexity unknown";
                    const steps = plan.steps || [];

                    const summary = `**Plan Proposed:**\n${planDesc}\n\n**Steps:**\n` + steps.map((s: any, i: number) => `${i + 1}. ${s.type === 'write' ? '📝 Write' : '💻 Run'} \`${s.path || s.command}\``).join('\n');

                    // Send Approval UI (Local Only)
                    await sendMessage(chatId, summary, {
                        inline_keyboard: [
                            [
                                { text: "✅ Approve (Run Locally)", callback_data: `APPROVE_PLAN` }
                            ],
                            [
                                { text: "🔄 Retry", callback_data: "RETRY_PLAN" },
                                { text: "❌ Cancel", callback_data: "CANCEL" }
                            ]
                        ]
                    });

                    // Save plan to loose temp file for stateless approval
                    const fs = require('fs');
                    const tmpPath = path.join(process.cwd(), '.next/cache/latest_plan.json'); // use .next cache dir
                    fs.writeFileSync(tmpPath, JSON.stringify({ task, plan }));

                } catch (e: any) {
                    await sendMessage(chatId, `❌ **Error:** ${e.message}`);
                }

            } else if (text.startsWith('/blog')) {
                const topic = text.replace('/blog', '').trim();
                if (!topic) {
                    await sendMessage(chatId, "✍️ **Genie Blogger**\n\nPlease provide a topic: `/blog The Future of AI`");
                    return NextResponse.json({ ok: true });
                }

                await sendMessage(chatId, "✍️ **Drafting blog post...**");
                await sendChatAction(chatId, 'typing');

                try {
                    // Construct a specific engineering task for blogging
                    const today = new Date().toISOString().split('T')[0]; // "2026-02-03"
                    const task = `Write a high-quality blog post about "${topic}" in content/blog/. IMPORTANT: Use this exact frontmatter with publishedAt: "${today}", author: "genie-team", and category: "engineering". Quote any title/description values that contain colons. Use the existing MDX files as a reference for style. Create a new file with a kebab-case filename. Ensure the content is engaging and technical.`;

                    const scriptPath = path.join(process.cwd(), '.agent/skills/genie-context/scripts/engineer.mjs');
                    // Run plan using the SAME engineer logic
                    const output = execFileSync('node', [scriptPath, task, '--plan-only'], {
                        encoding: 'utf-8',
                        env: { ...process.env, GOOGLE_API_KEY: process.env.GOOGLE_API_KEY }
                    });

                    // Extract JSON
                    const jsonMatch = output.match(/---JSON_START---([\s\S]*?)---JSON_END---/);
                    if (!jsonMatch) throw new Error("Could not parse blog plan.");

                    const plan = JSON.parse(jsonMatch[1]);
                    const planDesc = plan.plan || "Complexity unknown";
                    const steps = plan.steps || [];

                    const summary = `**Blog Draft Ready:**\n${planDesc}\n\n**Steps:**\n` + steps.map((s: any, i: number) => `${i + 1}. ${s.type === 'write' ? '📝 Create' : '💻 Run'} \`${s.path || s.command}\``).join('\n');

                    // Send Approval UI (Same callback logic works because it uses latest_plan.json)
                    await sendMessage(chatId, summary, {
                        inline_keyboard: [
                            [
                                { text: "✅ Publish (Commit & Push)", callback_data: `APPROVE_PLAN` }
                            ],
                            [
                                { text: "🔄 Retry", callback_data: "RETRY_PLAN" },
                                { text: "❌ Cancel", callback_data: "CANCEL" }
                            ]
                        ]
                    });

                    // Save plan to loose temp file for stateless approval
                    const fs = require('fs');
                    const tmpPath = path.join(process.cwd(), '.next/cache/latest_plan.json');
                    fs.writeFileSync(tmpPath, JSON.stringify({ task, plan }));

                } catch (e: any) {
                    await sendMessage(chatId, `❌ **Error:** ${e.message}`);
                }
            } else {
                await sendMessage(chatId, `🤖 I didn't understand that.\nCommands:\n\`/engineer <task>\` - Autonomous coding\n\`/blog <topic>\` - Write a blog post\n\`/reply <id> <msg>\` - Reply to support`);
            }
        }

        // 2. Handle Callbacks (Button Clicks)
        if (update.callback_query) {
            const chatId = update.callback_query.message.chat.id;
            const data = update.callback_query.data;

            if (data === 'CANCEL') {
                await sendMessage(chatId, "🚫 **Task Cancelled.**");
            } else if (data === 'APPROVE_PLAN') {
                await sendMessage(chatId, "🛠️ **Executing Plan Locally...**");
                await sendChatAction(chatId, 'typing');

                // Retrieve state
                const fs = require('fs');
                const tmpPath = path.join(process.cwd(), '.next/cache/latest_plan.json');

                if (fs.existsSync(tmpPath)) {
                    const stored = JSON.parse(fs.readFileSync(tmpPath, 'utf-8'));

                    try {
                        const scriptPath = path.join(process.cwd(), '.agent/skills/genie-context/scripts/engineer.mjs');
                        // Execute using file path (Safe from shell escaping issues)
                        execFileSync('node', [scriptPath, 'EXECUTE', '--plan-file', tmpPath], {
                            encoding: 'utf-8',
                            env: { ...process.env }
                        });

                        // Execution Success - Now Ask to Push
                        // Get current branch name
                        const branchName = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();

                        await sendMessage(chatId, `✅ **Local Execution Complete!**\nBranch: \`${branchName}\`\n\nReady to push to GitHub?`, {
                            inline_keyboard: [[{ text: "🚀 Push & Open PR", callback_data: "PUSH_PR" }]]
                        });

                    } catch (e: any) {
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

                    await sendMessage(chatId, `✅ **Pushed Successfully!**\n\nClick below to open PR (Reviews will start automatically):\n\n[🔗 Create Pull Request](${prUrl})`, {
                        disable_web_page_preview: true
                    });

                } catch (e: any) {
                    await sendMessage(chatId, `❌ **Push Failed:** ${e.message}`);
                }
            }
        }

        return NextResponse.json({ ok: true });
    } catch (err: any) {
        console.error('Telegram Webhook Error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
