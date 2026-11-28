import { env } from '@/lib/env';
import { verifyTelegramWebhookSecret, isTelegramPrivateAdmin } from '@/lib/security/telegramWebhookAuth';

import { NextResponse } from 'next/server';

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
 * Handle incoming Telegram Webhook
 */
export async function POST(req: Request) {
    const verification = verifyTelegramWebhookSecret(
        env.TELEGRAM_WEBHOOK_SECRET, req.headers.get('x-telegram-bot-api-secret-token'),
    );
    if (!verification.ok) return NextResponse.json({ error: 'Webhook unavailable or unauthorized' }, { status: verification.status });
    if (!BOT_TOKEN) return NextResponse.json({ error: 'Webhook unavailable' }, { status: 503 });

    try {
        const update: TelegramUpdate = await req.json();

        // 1. Handle Messages
        if (update.message) {
            const chatId = update.message.chat.id;
            const text = update.message.text || '';

            // --- AUTH CHECK: CONTACT SHARE ---
            if (update.message.contact) {
                const sharedPhone = update.message.contact.phone_number.replace('+', '');

                if (AUTH_PHONE && sharedPhone === AUTH_PHONE && update.message.contact.user_id === update.message.from.id && update.message.chat.type === 'private') {
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
                    await sendMessage(chatId, "Contact verification failed.");
                }
                return NextResponse.json({ ok: true });
            }

            // --- SECURITY & SUPPORT GATE ---
            const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID;

            // If user is NOT admin
            if (!isTelegramPrivateAdmin(ADMIN_CHAT_ID, update.message.chat, update.message.from)) {
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

            } else if (text.startsWith('/engineer') || text.startsWith('/blog')) {
                await sendMessage(chatId, "Engineering and publishing commands are disabled pending approval qualification.");
            } else {
                await sendMessage(chatId, `🤖 I didn't understand that.\nCommands:\n\`/engineer <task>\` - Autonomous coding\n\`/blog <topic>\` - Write a blog post\n\`/reply <id> <msg>\` - Reply to support`);
            }
        }

        // Existing callback approval uses a mutable, shared temp-file plan.
        // Do not execute or push until approvals are bound to an immutable
        // plan digest, current principal and durable one-time claim.
        if (update.callback_query) {
            return NextResponse.json({ error: 'Interactive execution is disabled pending qualification' }, { status: 403 });
        }

        return NextResponse.json({ ok: true });
    } catch (err: any) {
        console.error('Telegram webhook processing failed');
        return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
    }
}
