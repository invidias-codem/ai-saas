/**
 * Slack Events API Endpoint
 * Handles incoming Slack events including messages, app mentions, and DMs
 * This enables Genie to respond to messages in Slack channels
 */

import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";

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
  
  // Check timestamp is recent (within 5 minutes)
  const currentTime = Math.floor(Date.now() / 1000);
  if (Math.abs(currentTime - parseInt(timestamp)) > 300) {
    console.error('Slack request timestamp too old');
    return false;
  }

  // Verify signature
  const baseString = `v0:${timestamp}:${body}`;
  const hmac = crypto
    .createHmac('sha256', signingSecret)
    .update(baseString)
    .digest('hex');
  const expectedSignature = `v0=${hmac}`;

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Send a message to Slack
 */
async function sendSlackMessage(
  channel: string,
  text: string,
  threadTs?: string
): Promise<void> {
  const botToken = process.env.SLACK_BOT_TOKEN;
  if (!botToken) {
    throw new Error('SLACK_BOT_TOKEN not configured');
  }

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
      'Authorization': `Bearer ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!data.ok) {
    console.error('Slack API error:', data.error);
    throw new Error(`Slack API error: ${data.error}`);
  }
}

/**
 * Add a reaction to a message (to show processing)
 */
async function addReaction(
  channel: string,
  timestamp: string,
  emoji: string
): Promise<void> {
  const botToken = process.env.SLACK_BOT_TOKEN;
  if (!botToken) return;

  try {
    await fetch(`${SLACK_API_BASE}/reactions.add`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel,
        timestamp,
        name: emoji,
      }),
    });
  } catch (error) {
    console.error('Failed to add reaction:', error);
  }
}

/**
 * Remove a reaction from a message
 */
async function removeReaction(
  channel: string,
  timestamp: string,
  emoji: string
): Promise<void> {
  const botToken = process.env.SLACK_BOT_TOKEN;
  if (!botToken) return;

  try {
    await fetch(`${SLACK_API_BASE}/reactions.remove`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel,
        timestamp,
        name: emoji,
      }),
    });
  } catch (error) {
    console.error('Failed to remove reaction:', error);
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
    console.error('Error generating Genie response:', error);
    return "I apologize, but I encountered an error processing your request. Please try again.";
  }
}

/**
 * Handle app_mention events (when someone @mentions the bot)
 */
async function handleAppMention(event: any): Promise<void> {
  const { channel, text, ts, thread_ts, user } = event;
  
  // Remove the bot mention from the text
  const cleanText = text.replace(/<@[A-Z0-9]+>/g, '').trim();
  
  if (!cleanText) {
    await sendSlackMessage(
      channel,
      "Hi! How can I help you? Just mention me with your question.",
      thread_ts || ts
    );
    return;
  }

  // Add thinking reaction
  await addReaction(channel, ts, 'thinking_face');

  try {
    // Generate response
    const response = await generateGenieResponse(cleanText);
    
    // Remove thinking reaction and add done reaction
    await removeReaction(channel, ts, 'thinking_face');
    await addReaction(channel, ts, 'white_check_mark');
    
    // Send response in thread
    await sendSlackMessage(channel, response, thread_ts || ts);
  } catch (error) {
    console.error('Error handling app mention:', error);
    await removeReaction(channel, ts, 'thinking_face');
    await addReaction(channel, ts, 'x');
    await sendSlackMessage(
      channel,
      "Sorry, I encountered an error. Please try again.",
      thread_ts || ts
    );
  }
}

/**
 * Handle direct messages to the bot
 */
async function handleDirectMessage(event: any): Promise<void> {
  const { channel, text, ts, user } = event;
  
  // Ignore bot's own messages
  if (event.bot_id) return;
  
  // Add thinking reaction
  await addReaction(channel, ts, 'thinking_face');

  try {
    // Generate response
    const response = await generateGenieResponse(text);
    
    // Remove thinking reaction
    await removeReaction(channel, ts, 'thinking_face');
    
    // Send response
    await sendSlackMessage(channel, response);
  } catch (error) {
    console.error('Error handling DM:', error);
    await removeReaction(channel, ts, 'thinking_face');
    await sendSlackMessage(
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

    // Handle URL verification challenge IMMEDIATELY (required for Slack Events API setup)
    // This must respond quickly with just the challenge value
    if (body.type === 'url_verification') {
      console.log('[SLACK_EVENTS] URL verification challenge received');
      return new NextResponse(body.challenge, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    const timestamp = req.headers.get('x-slack-request-timestamp') || '';
    const signature = req.headers.get('x-slack-signature') || '';

    // Verify Slack signature (skip in development if needed)
    if (process.env.NODE_ENV === 'production' && process.env.SLACK_SIGNING_SECRET) {
      if (!verifySlackSignature(rawBody, timestamp, signature)) {
        console.error('[SLACK_EVENTS] Invalid Slack signature');
        return new NextResponse('Unauthorized', { status: 401 });
      }
    }

    // Handle events
    if (body.type === 'event_callback') {
      const event = body.event;

      // Respond immediately to avoid Slack retry
      // Process event asynchronously
      const responsePromise = (async () => {
        switch (event.type) {
          case 'app_mention':
            await handleAppMention(event);
            break;
          
          case 'message':
            // Only handle DMs (channel type 'im')
            if (event.channel_type === 'im' && !event.bot_id) {
              await handleDirectMessage(event);
            }
            break;
          
          default:
            console.log('Unhandled event type:', event.type);
        }
      })();

      // Don't await - respond immediately
      responsePromise.catch(err => console.error('Event processing error:', err));

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

// Also handle GET for verification
export async function GET(req: Request) {
  return NextResponse.json({ 
    status: 'Slack Events API endpoint active',
    timestamp: new Date().toISOString()
  });
}
