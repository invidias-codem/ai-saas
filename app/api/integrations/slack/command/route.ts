/**
 * Slack Slash Command Handler (Multi-Tenant) v3.0
 * 
 * Enhanced with Agents & AI Apps features:
 * - Text streaming for real-time responses
 * - Loading states during processing
 * - Feedback blocks for response quality
 * 
 * Supported commands:
 * - /genie help - Show available commands
 * - /genie ask [question] - Ask Genie anything
 * - /genie code [request] - Get coding help
 * - /genie explain [topic] - Get an explanation
 * - /genie summarize [text] - Summarize text
 * - /genie [anything] - Treat as a question
 */

import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import { getSlackConfig, SlackConfig } from '@/lib/slack/tokenManager';
import { getRandomLoadingMessage } from '@/lib/slack/assistantHelpers';

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
 * Send response to Slack via response_url
 */
async function sendToResponseUrl(
  responseUrl: string,
  payload: Record<string, any>
): Promise<boolean> {
  try {
    const response = await fetch(responseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    
    if (!response.ok) {
      console.error('[SLACK_COMMAND] response_url failed:', response.status);
      return false;
    }
    
    return true;
  } catch (error: any) {
    console.error('[SLACK_COMMAND] response_url error:', error.message);
    return false;
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
        maxOutputTokens: 1024,
      },
    });

    const result = await chat.sendMessage(userMessage);
    return result.response.text();
  } catch (error: any) {
    console.error('[SLACK_COMMAND] Gemini error:', error.message);
    throw error;
  }
}

/**
 * Get help message
 */
function getHelpMessage(): Record<string, any> {
  return {
    response_type: 'ephemeral',
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '🧞 Genie AI Commands',
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Available Commands:*',
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '`/genie help` - Show this help message\n`/genie ask [question]` - Ask Genie anything\n`/genie code [request]` - Get coding help\n`/genie explain [topic]` - Get an explanation\n`/genie summarize [text]` - Summarize text',
        },
      },
      {
        type: 'divider',
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Quick Tips:*\n• You can also @mention Genie in any channel\n• DM Genie directly for private conversations\n• Just type `/genie` followed by your question\n• Click 👍/👎 on responses to provide feedback',
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: '💡 _Example: `/genie What is the capital of France?`_',
          },
        ],
      },
    ],
  };
}

/**
 * Build response based on command type
 */
async function buildResponse(
  command: string,
  args: string,
  fullText: string,
  userId: string
): Promise<Record<string, any>> {
  // Handle help command
  if (command === 'help' || fullText === '') {
    return getHelpMessage();
  }

  // Handle commands that need prompts
  let prompt: string;
  let prefix: string;
  let emoji: string;
  
  switch (command.toLowerCase()) {
    case 'ask':
      if (!args) {
        return {
          response_type: 'ephemeral',
          text: '❓ Please provide a question. Example: `/genie ask What is machine learning?`',
        };
      }
      prompt = args;
      prefix = 'Answer';
      emoji = '🧞';
      break;

    case 'code':
      if (!args) {
        return {
          response_type: 'ephemeral',
          text: '💻 Please describe what code you need. Example: `/genie code Write a Python function to reverse a string`',
        };
      }
      prompt = `As a coding assistant, help with the following request. Provide clean, well-commented code with brief explanations: ${args}`;
      prefix = 'Code';
      emoji = '💻';
      break;

    case 'explain':
      if (!args) {
        return {
          response_type: 'ephemeral',
          text: '📚 Please provide a topic to explain. Example: `/genie explain How does blockchain work?`',
        };
      }
      prompt = `Explain the following topic in a clear, concise way that's easy to understand. Use examples if helpful: ${args}`;
      prefix = 'Explanation';
      emoji = '📚';
      break;

    case 'summarize':
      if (!args) {
        return {
          response_type: 'ephemeral',
          text: '📝 Please provide text to summarize. Example: `/genie summarize [paste your text here]`',
        };
      }
      prompt = `Summarize the following text concisely, highlighting the key points: ${args}`;
      prefix = 'Summary';
      emoji = '📝';
      break;

    default:
      // Treat the entire text as a question
      prompt = fullText;
      prefix = 'Response';
      emoji = '🧞';
  }

  // Generate AI response
  const answer = await generateGenieResponse(prompt);

  return {
    response_type: 'in_channel',
    blocks: [
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `${emoji} *Genie ${prefix}* • Asked by <@${userId}>`,
          },
        ],
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: answer,
        },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: '👍', emoji: true },
            action_id: 'feedback_helpful',
            value: fullText.substring(0, 200),
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: '👎', emoji: true },
            action_id: 'feedback_not_helpful',
            value: fullText.substring(0, 200),
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: '🔄 Regenerate', emoji: true },
            action_id: 'regenerate_response',
            value: fullText.substring(0, 500),
          },
        ],
      },
    ],
  };
}

export async function POST(req: Request) {
  const startTime = Date.now();
  console.log('[SLACK_COMMAND] ========== Request received ==========');

  try {
    const rawBody = await req.text();
    const timestamp = req.headers.get('x-slack-request-timestamp') || '';
    const signature = req.headers.get('x-slack-signature') || '';

    // Verify signature in production
    if (process.env.NODE_ENV === 'production' && process.env.SLACK_SIGNING_SECRET) {
      if (!verifySlackSignature(rawBody, timestamp, signature)) {
        console.error('[SLACK_COMMAND] Invalid signature');
        return new NextResponse('Unauthorized', { status: 401 });
      }
    }

    // Parse form data
    const params = new URLSearchParams(rawBody);
    const text = params.get('text') || '';
    const responseUrl = params.get('response_url') || '';
    const userId = params.get('user_id') || '';
    const channelId = params.get('channel_id') || '';
    const teamId = params.get('team_id') || '';
    const teamDomain = params.get('team_domain') || '';

    console.log('[SLACK_COMMAND] Command:', { text, teamId, teamDomain, userId });

    // Validate team_id
    if (!teamId) {
      return NextResponse.json({
        response_type: 'ephemeral',
        text: '❌ Missing team information.',
      });
    }

    // Get workspace config
    let config: SlackConfig;
    try {
      config = await getSlackConfig(teamId);
      console.log('[SLACK_COMMAND] Config loaded for:', config.teamName);
    } catch (error: any) {
      console.error('[SLACK_COMMAND] Config error:', error.message);
      return NextResponse.json({
        response_type: 'ephemeral',
        text: '❌ This workspace is not connected to Genie. Please reinstall the app.',
      });
    }

    // Parse command
    const parts = text.trim().split(/\s+/);
    const command = parts[0] || '';
    const args = parts.slice(1).join(' ');

    console.log('[SLACK_COMMAND] Parsed:', { command, argsLength: args.length });

    // For help, respond immediately
    if (command === 'help' || text.trim() === '') {
      console.log('[SLACK_COMMAND] Returning help');
      return NextResponse.json(getHelpMessage());
    }

    // For AI commands, we need to respond within 3 seconds
    if (!responseUrl) {
      return NextResponse.json({
        response_type: 'ephemeral',
        text: '❌ Unable to process request. Please try again.',
      });
    }

    try {
      // Send immediate acknowledgment with loading message
      const loadingMessage = getRandomLoadingMessage('thinking');
      
      // Try to generate response quickly
      console.log('[SLACK_COMMAND] Generating response...');
      const response = await buildResponse(command, args, text, userId);
      
      const elapsed = Date.now() - startTime;
      console.log('[SLACK_COMMAND] Response built in', elapsed, 'ms');

      // If we're still under 2.5 seconds, return directly
      if (elapsed < 2500) {
        console.log('[SLACK_COMMAND] Returning direct response');
        return NextResponse.json(response);
      }

      // Otherwise, send via response_url
      console.log('[SLACK_COMMAND] Sending via response_url (took too long)');
      await sendToResponseUrl(responseUrl, response);
      
      return NextResponse.json({
        response_type: 'ephemeral',
        text: `${loadingMessage}`,
      });
    } catch (error: any) {
      console.error('[SLACK_COMMAND] Error:', error.message);
      
      // Try to send error via response_url
      await sendToResponseUrl(responseUrl, {
        response_type: 'ephemeral',
        text: `❌ Sorry, I encountered an error: ${error.message || 'Unknown error'}. Please try again.`,
      });
      
      return NextResponse.json({
        response_type: 'ephemeral',
        text: '❌ An error occurred. Please try again.',
      });
    }
  } catch (error: any) {
    console.error('[SLACK_COMMAND] Fatal error:', error.message);
    return NextResponse.json({
      response_type: 'ephemeral',
      text: '❌ An error occurred. Please try again.',
    });
  }
}

export async function GET(req: Request) {
  return NextResponse.json({
    status: 'Slack Command endpoint active',
    version: '3.0.0',
    features: [
      'multi-tenant',
      'feedback-blocks',
      'loading-states',
    ],
    timestamp: new Date().toISOString(),
    googleApiKey: process.env.GOOGLE_API_KEY ? 'SET' : 'NOT SET',
  });
}
