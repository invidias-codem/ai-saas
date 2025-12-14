/**
 * Slack Events API Endpoint (Multi-Tenant)
 * Handles incoming Slack events from ANY workspace
 * 
 * This endpoint receives events from all installed workspaces.
 * It dynamically resolves the correct bot token for each workspace
 * using the team_id from the event payload.
 * 
 * Supported events:
 * - app_mention: When someone @mentions the bot
 * - message (im): Direct messages to the bot
 */

import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import { getSlackConfig, SlackConfig } from '@/lib/slack/tokenManager';

const SLACK_API_BASE = 'https://slack.com/api';

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || '');
const model = genAI.getGenerativeModel({
  model: "gemini-2.0-flash",
  safetySettings: [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  ],
});

const GENIE_SYSTEM_PROMPT = `You are 'Genie', a helpful AI assistant integrated with Slack. 
You provide concise, helpful responses suitable for chat. 
Keep responses brief but informative - Slack users prefer shorter messages.
Use Slack markdown formatting: *bold*, _italic_, \`code\`, \`\`\`code blocks\`\`\`.
When appropriate, use bullet points for clarity.
Be friendly and professional.`;

/**
 * Verify Slack request signature
 * Note: The signing secret is shared across all workspaces (it's app-level, not workspace-level)
 */
function verifySlackSignature(
  body: string,
  timestamp: string,
  signature: string
): boolean {
  const signingSecret = process.env.SLACK_SIGNING_SECRET || '';

  // Check timestamp is recent (within 5 minutes)
  const currentTime = Math.floor(Date.now() / 1000);
  if (Math.abs(currentTime - parseInt(timestamp)) > 300) {
    console.error('[SLACK_EVENTS] Request timestamp too old');
    return false;
  }

  // Verify signature
  const baseString = `v0:${timestamp}:${body}`;
  const hmac = crypto
    .createHmac('sha256', signingSecret)
    .update(baseString)
    .digest('hex');
  const expectedSignature = `v0=${hmac}`;

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}

/**
 * Send a message to Slack
 * @param token - Bot token for the specific workspace
 * @param channel - Channel ID
 * @param text - Message text
 * @param threadTs - Optional thread timestamp for replies
 */
async function sendSlackMessage(
  token: string,
  channel: string,
  text: string,
  threadTs?: string
): Promise<{ ok: boolean; ts?: string; error?: string }> {
  const payload: Record<string, any> = {
    channel,
    text,
    mrkdwn: true,
  };

  // Reply in thread if thread_ts is provided
  if (threadTs) {
    payload.thread_ts = threadTs;
  }

  const response = await fetch(`${SLACK_API_BASE}/chat.postMessage`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  
  if (!data.ok) {
    console.error('[SLACK_EVENTS] Slack API error:', data.error);
  }
  
  return data;
}

/**
 * Add a reaction to a message (to show processing)
 * @param token - Bot token for the specific workspace
 */
async function addReaction(
  token: string,
  channel: string,
  timestamp: string,
  emoji: string
): Promise<void> {
  try {
    await fetch(`${SLACK_API_BASE}/reactions.add`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel,
        timestamp,
        name: emoji,
      }),
    });
  } catch (error) {
    console.error('[SLACK_EVENTS] Failed to add reaction:', error);
  }
}

/**
 * Remove a reaction from a message
 * @param token - Bot token for the specific workspace
 */
async function removeReaction(
  token: string,
  channel: string,
  timestamp: string,
  emoji: string
): Promise<void> {
  try {
    await fetch(`${SLACK_API_BASE}/reactions.remove`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel,
        timestamp,
        name: emoji,
      }),
    });
  } catch (error) {
    console.error('[SLACK_EVENTS] Failed to remove reaction:', error);
  }
}

/**
 * Generate AI response using Gemini
 */
async function generateGenieResponse(userMessage: string): Promise<string> {
  try {
    const chat = model.startChat({
      history: [
        {
          role: "user",
          parts: [{ text: GENIE_SYSTEM_PROMPT }],
        },
        {
          role: "model",
          parts: [{ text: "I understand. I'm Genie, ready to help in Slack with concise, helpful responses." }],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.8,
        maxOutputTokens: 1024, // Keep responses shorter for Slack
      },
    });

    const result = await chat.sendMessage(userMessage);
    return result.response.text();
  } catch (error) {
    console.error('[SLACK_EVENTS] Error generating Genie response:', error);
    return "I apologize, but I encountered an error processing your request. Please try again.";
  }
}

/**
 * Handle app_mention events (when someone @mentions the bot)
 * @param config - Slack configuration for this workspace
 * @param event - The event payload from Slack
 */
async function handleAppMention(config: SlackConfig, event: any): Promise<void> {
  const { channel, text, ts, thread_ts, user } = event;

  // Remove the bot mention from the text
  const cleanText = text.replace(/<@[A-Z0-9]+>/g, '').trim();

  if (!cleanText) {
    await sendSlackMessage(
      config.botToken,
      channel,
      "Hi! How can I help you? Just mention me with your question.",
      thread_ts || ts
    );
    return;
  }

  // Add thinking reaction
  await addReaction(config.botToken, channel, ts, 'thinking_face');

  try {
    // Generate response
    const response = await generateGenieResponse(cleanText);

    // Remove thinking reaction and add done reaction
    await removeReaction(config.botToken, channel, ts, 'thinking_face');
    await addReaction(config.botToken, channel, ts, 'white_check_mark');

    // Send response in thread
    await sendSlackMessage(config.botToken, channel, response, thread_ts || ts);
    
    console.log('[SLACK_EVENTS] Handled app_mention:', {
      teamId: config.teamId,
      channel,
      user,
      inputLength: cleanText.length,
      outputLength: response.length,
    });
  } catch (error) {
    console.error('[SLACK_EVENTS] Error handling app mention:', error);
    await removeReaction(config.botToken, channel, ts, 'thinking_face');
    await addReaction(config.botToken, channel, ts, 'x');
    await sendSlackMessage(
      config.botToken,
      channel,
      "Sorry, I encountered an error. Please try again.",
      thread_ts || ts
    );
  }
}

/**
 * Handle direct messages to the bot
 * @param config - Slack configuration for this workspace
 * @param event - The event payload from Slack
 */
async function handleDirectMessage(config: SlackConfig, event: any): Promise<void> {
  const { channel, text, ts, user } = event;

  // Add thinking reaction
  await addReaction(config.botToken, channel, ts, 'thinking_face');

  try {
    // Generate response
    const response = await generateGenieResponse(text);

    // Remove thinking reaction
    await removeReaction(config.botToken, channel, ts, 'thinking_face');

    // Send response
    await sendSlackMessage(config.botToken, channel, response);
    
    console.log('[SLACK_EVENTS] Handled DM:', {
      teamId: config.teamId,
      user,
      inputLength: text.length,
      outputLength: response.length,
    });
  } catch (error) {
    console.error('[SLACK_EVENTS] Error handling DM:', error);
    await removeReaction(config.botToken, channel, ts, 'thinking_face');
    await sendSlackMessage(
      config.botToken,
      channel,
      "Sorry, I encountered an error. Please try again."
    );
  }
}

export async function POST(req: Request) {
  let rawBody = '';

  try {
    rawBody = await req.text();
    console.log('[SLACK_EVENTS] Received request, body length:', rawBody.length);

    // Parse body first to handle challenge ASAP
    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch (parseError) {
      console.error('[SLACK_EVENTS] Failed to parse JSON:', parseError);
      return new NextResponse('Invalid JSON', { status: 400 });
    }

    // ─────────────────────────────────────────────────────────────────
    // Handle URL verification challenge IMMEDIATELY
    // This is required for Slack Events API setup and must respond quickly
    // ─────────────────────────────────────────────────────────────────
    if (body.type === 'url_verification') {
      console.log('[SLACK_EVENTS] URL verification challenge received');
      return new NextResponse(body.challenge, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    // ─────────────────────────────────────────────────────────────────
    // Extract Team ID (CRITICAL FOR MULTI-TENANCY)
    // ─────────────────────────────────────────────────────────────────
    const teamId = body.team_id;
    if (!teamId) {
      console.error('[SLACK_EVENTS] No team_id in request');
      return new NextResponse('Missing team_id', { status: 400 });
    }

    // ─────────────────────────────────────────────────────────────────
    // Fetch Dynamic Credentials for this Workspace
    // ─────────────────────────────────────────────────────────────────
    let config: SlackConfig;
    try {
      config = await getSlackConfig(teamId);
    } catch (configError) {
      console.error(`[SLACK_EVENTS] No installation for team ${teamId}:`, configError);
      // Return 200 to prevent Slack from retrying
      // The workspace needs to reinstall the app
      return NextResponse.json({ 
        ok: false, 
        error: 'workspace_not_installed',
        message: 'This workspace needs to reinstall the Genie app.',
      });
    }

    console.log('[SLACK_EVENTS] Resolved config for team:', {
      teamId: config.teamId,
      teamName: config.teamName,
      botUserId: config.botUserId,
    });

    // ───────────────────────────────────────────────��─────────────────
    // Verify Slack Signature
    // Note: Signing secret is app-level, shared across all workspaces
    // ─────────────────────────────────────────────────────────────────
    const timestamp = req.headers.get('x-slack-request-timestamp') || '';
    const signature = req.headers.get('x-slack-signature') || '';

    if (process.env.NODE_ENV === 'production' && process.env.SLACK_SIGNING_SECRET) {
      if (!verifySlackSignature(rawBody, timestamp, signature)) {
        console.error('[SLACK_EVENTS] Invalid Slack signature');
        return new NextResponse('Unauthorized', { status: 401 });
      }
    }

    // ─────────────────────────────────────────────────────────────────
    // Handle Events
    // ─────────────────────────────────────────────────────────────────
    if (body.type === 'event_callback') {
      const event = body.event;

      // ───────────────────────────────────────────���─────────────────────
      // CRITICAL: Ignore bot's own messages using DYNAMIC botUserId
      // This prevents infinite loops where the bot responds to itself
      // ─────────────────────────────────────────────────────────────────
      if (event.user === config.botUserId || event.bot_id) {
        console.log('[SLACK_EVENTS] Ignoring bot message');
        return NextResponse.json({ ok: true });
      }

      // Process event asynchronously to respond quickly to Slack
      // Slack will retry if we don't respond within 3 seconds
      const responsePromise = (async () => {
        try {
          switch (event.type) {
            case 'app_mention':
              await handleAppMention(config, event);
              break;

            case 'message':
              // Only handle DMs (channel type 'im')
              if (event.channel_type === 'im' && !event.bot_id && !event.subtype) {
                await handleDirectMessage(config, event);
              }
              break;

            default:
              console.log('[SLACK_EVENTS] Unhandled event type:', event.type);
          }
        } catch (handlerError) {
          console.error('[SLACK_EVENTS] Event handler error:', handlerError);
        }
      })();

      // Don't await - respond immediately to Slack
      responsePromise.catch((err) =>
        console.error('[SLACK_EVENTS] Event processing error:', err)
      );

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('[SLACK_EVENTS_ERROR]', error);
    return new NextResponse(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// Also handle GET for verification/health check
export async function GET(req: Request) {
  return NextResponse.json({
    status: 'Slack Events API endpoint active',
    version: '2.0.0', // Multi-tenant version
    timestamp: new Date().toISOString(),
  });
}
