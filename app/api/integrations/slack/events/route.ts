/**
 * Slack Events API Endpoint (Multi-Tenant) v3.0
 * 
 * Enhanced with Agents & AI Apps features:
 * - Text streaming for real-time responses
 * - Loading states during processing
 * - Suggested prompts for new threads
 * - Thread titles for organization
 * - Feedback blocks for response quality
 * 
 * Supported events:
 * - app_mention: When someone @mentions the bot
 * - message (im): Direct messages to the bot
 * - assistant_thread_started: When user opens AI container
 * - assistant_thread_context_changed: When user switches channels
 * - app_home_opened: When user opens App Home
 */

import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import { getSlackConfig, SlackConfig } from '@/lib/slack/tokenManager';
import {
  setAssistantStatus,
  clearAssistantStatus,
  setSuggestedPrompts,
  setThreadTitle,
  createStreamer,
  createFeedbackBlocks,
  getContextAwarePrompts,
  generateThreadTitle,
  getRandomLoadingMessage,
  LOADING_MESSAGES,
} from '@/lib/slack/assistantHelpers';

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
 */
function verifySlackSignature(
  body: string,
  timestamp: string,
  signature: string
): boolean {
  const signingSecret = process.env.SLACK_SIGNING_SECRET || '';

  const currentTime = Math.floor(Date.now() / 1000);
  if (Math.abs(currentTime - parseInt(timestamp)) > 300) {
    console.error('[SLACK_EVENTS] Request timestamp too old');
    return false;
  }

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
 * Send a message to Slack with optional blocks
 */
async function sendSlackMessage(
  token: string,
  channel: string,
  text: string,
  threadTs?: string,
  blocks?: any[]
): Promise<{ ok: boolean; ts?: string; error?: string }> {
  const payload: Record<string, any> = {
    channel,
    text,
    mrkdwn: true,
  };

  if (threadTs) {
    payload.thread_ts = threadTs;
  }

  if (blocks) {
    payload.blocks = blocks;
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
 * Add a reaction to a message
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
 * Generate AI response using Gemini with streaming
 * Returns an async generator for streaming responses
 */
async function* generateGenieResponseStream(userMessage: string): AsyncGenerator<string, void, unknown> {
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
        maxOutputTokens: 1024,
      },
    });

    const result = await chat.sendMessageStream(userMessage);
    
    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) {
        yield text;
      }
    }
  } catch (error) {
    console.error('[SLACK_EVENTS] Error generating Genie response:', error);
    yield "I apologize, but I encountered an error processing your request. Please try again.";
  }
}

/**
 * Generate AI response (non-streaming fallback)
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
        maxOutputTokens: 1024,
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
 * Handle assistant_thread_started event
 * When user opens the AI container/split view
 */
async function handleAssistantThreadStarted(config: SlackConfig, event: any): Promise<void> {
  const { channel_id, thread_ts, context } = event.assistant_thread || event;
  
  console.log('[SLACK_EVENTS] Assistant thread started:', {
    teamId: config.teamId,
    channel: channel_id,
    threadTs: thread_ts,
    hasContext: !!context,
  });

  try {
    // Send welcome message
    await sendSlackMessage(
      config.botToken,
      channel_id,
      "🧞 Hi! I'm Genie, your AI assistant. How can I help you today?",
      thread_ts
    );

    // Set suggested prompts based on context
    const hasChannelContext = context?.channel_id != null;
    const prompts = getContextAwarePrompts(hasChannelContext);
    
    await setSuggestedPrompts(
      config.botToken,
      channel_id,
      thread_ts,
      "What can I help you with?",
      prompts
    );

    console.log('[SLACK_EVENTS] Set suggested prompts for new thread');
  } catch (error) {
    console.error('[SLACK_EVENTS] Error handling assistant_thread_started:', error);
  }
}

/**
 * Handle assistant_thread_context_changed event
 * When user switches channels while AI container is open
 */
async function handleAssistantThreadContextChanged(config: SlackConfig, event: any): Promise<void> {
  const { channel_id, thread_ts, context } = event.assistant_thread || event;
  
  console.log('[SLACK_EVENTS] Assistant thread context changed:', {
    teamId: config.teamId,
    newChannelContext: context?.channel_id,
  });

  // Update suggested prompts based on new context
  try {
    const hasChannelContext = context?.channel_id != null;
    const prompts = getContextAwarePrompts(hasChannelContext);
    
    await setSuggestedPrompts(
      config.botToken,
      channel_id,
      thread_ts,
      hasChannelContext ? "Actions for this channel:" : "What can I help you with?",
      prompts
    );
  } catch (error) {
    console.error('[SLACK_EVENTS] Error handling context change:', error);
  }
}

/**
 * Handle app_mention events with streaming
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

  const threadTs = thread_ts || ts;

  // Set loading status
  await setAssistantStatus(
    config.botToken,
    channel,
    threadTs,
    getRandomLoadingMessage('thinking')
  );

  try {
    // Try streaming first
    const streamer = createStreamer({
      botToken: config.botToken,
      channel,
      threadTs,
    });

    const started = await streamer.start();
    
    if (started) {
      // Stream the response
      for await (const chunk of generateGenieResponseStream(cleanText)) {
        await streamer.append(chunk);
      }
      await streamer.stop();
      
      console.log('[SLACK_EVENTS] Streamed response for app_mention:', {
        teamId: config.teamId,
        channel,
        user,
        inputLength: cleanText.length,
        outputLength: streamer.getBuffer().length,
      });
    } else {
      // Fallback to non-streaming
      console.log('[SLACK_EVENTS] Streaming not available, using fallback');
      const response = await generateGenieResponse(cleanText);
      
      // Generate response ID for feedback
      const responseId = `${ts}-${Date.now()}`;
      
      await sendSlackMessage(
        config.botToken,
        channel,
        `🧞 *Genie:*\n${response}`,
        threadTs,
        createFeedbackBlocks(responseId, cleanText)
      );
    }

    // Clear loading status
    await clearAssistantStatus(config.botToken, channel, threadTs);
    
    // Add completion reaction
    await addReaction(config.botToken, channel, ts, 'white_check_mark');
  } catch (error) {
    console.error('[SLACK_EVENTS] Error handling app mention:', error);
    await clearAssistantStatus(config.botToken, channel, threadTs);
    await addReaction(config.botToken, channel, ts, 'x');
    await sendSlackMessage(
      config.botToken,
      channel,
      "Sorry, I encountered an error. Please try again.",
      threadTs
    );
  }
}

/**
 * Handle direct messages with streaming
 */
async function handleDirectMessage(config: SlackConfig, event: any): Promise<void> {
  const { channel, text, ts, thread_ts, user } = event;
  
  // Use thread_ts if available, otherwise use ts as the thread
  const threadTs = thread_ts || ts;

  // Set loading status
  await setAssistantStatus(
    config.botToken,
    channel,
    threadTs,
    getRandomLoadingMessage('friendly')
  );

  // Set thread title based on first message
  if (!thread_ts) {
    const title = generateThreadTitle(text);
    await setThreadTitle(config.botToken, channel, ts, title);
  }

  try {
    // Try streaming first
    const streamer = createStreamer({
      botToken: config.botToken,
      channel,
      threadTs,
    });

    const started = await streamer.start();
    
    if (started) {
      // Stream the response
      for await (const chunk of generateGenieResponseStream(text)) {
        await streamer.append(chunk);
      }
      await streamer.stop();
      
      console.log('[SLACK_EVENTS] Streamed DM response:', {
        teamId: config.teamId,
        user,
        inputLength: text.length,
        outputLength: streamer.getBuffer().length,
      });
    } else {
      // Fallback to non-streaming
      console.log('[SLACK_EVENTS] Streaming not available for DM, using fallback');
      const response = await generateGenieResponse(text);
      
      // Generate response ID for feedback
      const responseId = `${ts}-${Date.now()}`;
      
      await sendSlackMessage(
        config.botToken,
        channel,
        response,
        threadTs,
        createFeedbackBlocks(responseId, text)
      );
    }

    // Clear loading status
    await clearAssistantStatus(config.botToken, channel, threadTs);
  } catch (error) {
    console.error('[SLACK_EVENTS] Error handling DM:', error);
    await clearAssistantStatus(config.botToken, channel, threadTs);
    await sendSlackMessage(
      config.botToken,
      channel,
      "Sorry, I encountered an error. Please try again.",
      threadTs
    );
  }
}

/**
 * Handle app_home_opened event
 */
async function handleAppHomeOpened(config: SlackConfig, event: any): Promise<void> {
  const { user, tab, channel } = event;
  
  console.log('[SLACK_EVENTS] App Home opened:', {
    teamId: config.teamId,
    user,
    tab,
  });

  // Only handle Home tab for now
  if (tab === 'home') {
    // TODO: Implement App Home view publishing
    // This will be implemented in Phase 6
    console.log('[SLACK_EVENTS] Home tab opened - view publishing not yet implemented');
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

    // ──────��──────────────────────────────────────────────────────────
    // Handle URL verification challenge IMMEDIATELY
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

    // ──────��──────────────────────────────────────────────────────────
    // Fetch Dynamic Credentials for this Workspace
    // ─────────────────────────────────────────────────────────────────
    let config: SlackConfig;
    try {
      config = await getSlackConfig(teamId);
    } catch (configError) {
      console.error(`[SLACK_EVENTS] No installation for team ${teamId}:`, configError);
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

    // ─────────────────────────────────────────────────────────────────
    // Verify Slack Signature
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

      // Ignore bot's own messages
      if (event.user === config.botUserId || event.bot_id) {
        console.log('[SLACK_EVENTS] Ignoring bot message');
        return NextResponse.json({ ok: true });
      }

      // Process event asynchronously
      const responsePromise = (async () => {
        try {
          switch (event.type) {
            // ─────────────────────────────────────────────────────────
            // NEW: Assistant Thread Events (Agents & AI Apps)
            // ─────────────────────────────────────────────────────────
            case 'assistant_thread_started':
              await handleAssistantThreadStarted(config, event);
              break;

            case 'assistant_thread_context_changed':
              await handleAssistantThreadContextChanged(config, event);
              break;

            // ─────────────────────────────────────────────────────────
            // Existing Events (Enhanced with streaming)
            // ─────────────────────────────────────────────────────────
            case 'app_mention':
              await handleAppMention(config, event);
              break;

            case 'message':
              // Handle DMs (channel type 'im')
              if (event.channel_type === 'im' && !event.bot_id && !event.subtype) {
                await handleDirectMessage(config, event);
              }
              break;

            // ─────────────────────────────────────────────────────────
            // App Home Events
            // ─────────────────────────────────────────────────────────
            case 'app_home_opened':
              await handleAppHomeOpened(config, event);
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

// Health check endpoint
export async function GET(req: Request) {
  return NextResponse.json({
    status: 'Slack Events API endpoint active',
    version: '3.0.0', // Agents & AI Apps version
    features: [
      'multi-tenant',
      'text-streaming',
      'loading-states',
      'suggested-prompts',
      'thread-titles',
      'feedback-blocks',
    ],
    timestamp: new Date().toISOString(),
  });
}
