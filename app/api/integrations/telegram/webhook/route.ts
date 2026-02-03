
import { NextResponse } from 'next/server';
import { execSync } from 'child_process';
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

            // --- SECURITY GATE ---
            // If we haven't set the Admin Chat ID yet, only allow Contact requests.
            const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID;

            if (!ADMIN_CHAT_ID || String(chatId) !== ADMIN_CHAT_ID) {
                await sendMessage(chatId, "👋 **Welcome into the Genie Command Center!**\n\nI need to verify your identity. Please tap the button below to share your contact.", {
                    keyboard: [[{ text: "📱 Verify Phone Number", request_contact: true }]],
                    one_time_keyboard: true,
                    resize_keyboard: true
                });
                return NextResponse.json({ ok: true });
            }

            // --- COMMANDS ---
            if (text.startsWith('/engineer')) {
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
                    const output = execSync(`node ${scriptPath} "${task}" --plan-only`, {
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

                    // Send Approval UI
                    await sendMessage(chatId, summary, {
                        inline_keyboard: [
                            [
                                { text: "✅ Approve & Execute", callback_data: `APPROVE_PLAN` }, // In real app, store Plan ID state. Here we might need to verify "Task" again? 
                                // Stateless limitation: Callback buttons usually need state.
                                // Hack: We can't pass the whole plan in callback_data (64 bytes limit).
                                // Solution for Stateless:
                                // Just re-run the plan execution assuming deterministic? No.
                                // We need to store the plan temporarily?
                                // Or... we just ask user to reply "YES"?
                                // Let's try to leverage a temporary file "current_plan.json" in /tmp?
                                // Simple and cost effective.
                            ],
                            [{ text: "❌ Cancel", callback_data: "CANCEL" }]
                        ]
                    });

                    // Save plan to loose temp file for stateless approval
                    const fs = require('fs');
                    const tmpPath = path.join(process.cwd(), '.next/cache/latest_plan.json'); // use .next cache dir
                    fs.writeFileSync(tmpPath, JSON.stringify({ task, plan }));

                } catch (e: any) {
                    await sendMessage(chatId, `❌ **Error:** ${e.message}`);
                }
            } else {
                await sendMessage(chatId, `🤖 I didn't understand that.\nTry: \`/engineer [task]\``);
            }
        }

        // 2. Handle Callbacks (Button Clicks)
        if (update.callback_query) {
            const chatId = update.callback_query.message.chat.id;
            const data = update.callback_query.data;

            if (data === 'CANCEL') {
                await sendMessage(chatId, "🚫 **Task Cancelled.**");
            } else if (data === 'APPROVE_PLAN') {
                await sendMessage(chatId, "🚀 **Executing Plan...** (This may take a moment)");
                await sendChatAction(chatId, 'typing');

                // Retrieve state
                const fs = require('fs');
                const tmpPath = path.join(process.cwd(), '.next/cache/latest_plan.json');

                if (fs.existsSync(tmpPath)) {
                    const stored = JSON.parse(fs.readFileSync(tmpPath, 'utf-8'));

                    try {
                        const scriptPath = path.join(process.cwd(), '.agent/skills/genie-context/scripts/engineer.mjs');
                        // Execute using file path (Safe from shell escaping issues)
                        execSync(`node ${scriptPath} "EXECUTE" --plan-file '${tmpPath}'`, {
                            encoding: 'utf-8',
                            env: { ...process.env }
                        });

                        await sendMessage(chatId, "✅ **Execution Complete!**\nSystem updated.");
                    } catch (e: any) {
                        await sendMessage(chatId, `❌ **Execution Failed:** ${e.message}`);
                    }
                } else {
                    await sendMessage(chatId, "⚠️ Plan expired or not found. Please run /engineer again.");
                }
            }
        }

        return NextResponse.json({ ok: true });
    } catch (err: any) {
        console.error('Telegram Webhook Error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
