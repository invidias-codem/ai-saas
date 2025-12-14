/**
 * Slack Slash Command Handler (Multi-Tenant)
 * Handles /genie commands from ANY workspace
 * 
 * This endpoint receives slash commands from all installed workspaces.
 * It dynamically resolves the correct bot token for each workspace
 * using the team_id from the command payload.
 * 
 * Supported commands:
 * - /genie help - Show available commands
 * - /genie ask [question] - Ask Genie anything
 * - /genie code [request] - Get coding help
 * - /genie explain [topic] - Get an explanation
 * - /genie summarize [text] - Summarize text
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
 * Note: The signing secret is shared across all workspaces (it's app-level)
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
 * Send delayed response to Slack via response_url
 * This is used for responses that take longer than 3 seconds
 */
async function sendDelayedResponse(
  responseUrl: string,
  payload: Record<string, any>
): Promise<boolean> {
  try {
    console.log('[SLACK_COMMAND] Sending delayed response to:', responseUrl.substring(0, 50) + '...');
    
    const response = await fetch(responseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[SLACK_COMMAND] Failed to send delayed response:', response.status, errorText);
      return false;
    }
    
    console.log('[SLACK_COMMAND] Delayed response sent successfully');
    return true;
  } catch (error) {
    console.error('[SLACK_COMMAND] Error sending delayed response:', error);
    return false;
  }
}

/**
 * Generate AI response using Gemini
 */
async function generateGenieResponse(userMessage: string): Promise<string> {
  try {
    console.log('[SLACK_COMMAND] Generating Gemini response for:', userMessage.substring(0, 50) + '...');
    
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
    const responseText = result.response.text();
    
    console.log('[SLACK_COMMAND] Gemini response generated, length:', responseText.length);
    return responseText;
  } catch (error: any) {
    console.error('[SLACK_COMMAND] Error generating Genie response:', error.message || error);
    return "I apologize, but I encountered an error processing your request. Please try again.";
  }
}

/**
 * Get help message with available commands
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
          text: '*Quick Tips:*\n• You can also @mention Genie in any channel\n• DM Genie directly for private conversations\n• Genie remembers context within a thread',
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: '💡 _Example: `/genie ask What is the capital of France?`_',
          },
        ],
      },
    ],
  };
}

/**
 * Process the command and generate response
 * @param config - Slack configuration for this workspace
 * @param command - The command (e.g., "ask", "code", "help")
 * @param args - Arguments after the command
 * @param responseUrl - URL to send delayed responses
 * @param userId - Slack user ID who invoked the command
 * @param channelId - Channel where command was invoked
 */
async function processCommand(
  config: SlackConfig,
  command: string,
  args: string,
  responseUrl: string,
  userId: string,
  channelId: string
): Promise<void> {
  let response: Record<string, any>;
  const startTime = Date.now();

  console.log('[SLACK_COMMAND] Processing command:', { command, argsLength: args.length });

  try {
    switch (command.toLowerCase()) {
      case 'help':
      case '':
        response = getHelpMessage();
        break;

      case 'ask':
        if (!args) {
          response = {
            response_type: 'ephemeral',
            text: '❓ Please provide a question. Example: `/genie ask What is machine learning?`',
          };
        } else {
          const answer = await generateGenieResponse(args);
          response = {
            response_type: 'in_channel',
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `*Question:* ${args}`,
                },
              },
              {
                type: 'divider',
              },
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `🧞 *Genie:*\n${answer}`,
                },
              },
            ],
          };
        }
        break;

      case 'code':
        if (!args) {
          response = {
            response_type: 'ephemeral',
            text: '💻 Please describe what code you need. Example: `/genie code Write a Python function to reverse a string`',
          };
        } else {
          const codePrompt = `As a coding assistant, help with the following request. Provide clean, well-commented code with brief explanations: ${args}`;
          const codeAnswer = await generateGenieResponse(codePrompt);
          response = {
            response_type: 'in_channel',
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `*Code Request:* ${args}`,
                },
              },
              {
                type: 'divider',
              },
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `💻 *Genie Code:*\n${codeAnswer}`,
                },
              },
            ],
          };
        }
        break;

      case 'explain':
        if (!args) {
          response = {
            response_type: 'ephemeral',
            text: '📚 Please provide a topic to explain. Example: `/genie explain How does blockchain work?`',
          };
        } else {
          const explainPrompt = `Explain the following topic in a clear, concise way that's easy to understand. Use examples if helpful: ${args}`;
          const explanation = await generateGenieResponse(explainPrompt);
          response = {
            response_type: 'in_channel',
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `*Topic:* ${args}`,
                },
              },
              {
                type: 'divider',
              },
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `📚 *Explanation:*\n${explanation}`,
                },
              },
            ],
          };
        }
        break;

      case 'summarize':
        if (!args) {
          response = {
            response_type: 'ephemeral',
            text: '📝 Please provide text to summarize. Example: `/genie summarize [paste your text here]`',
          };
        } else {
          const summarizePrompt = `Summarize the following text concisely, highlighting the key points: ${args}`;
          const summary = await generateGenieResponse(summarizePrompt);
          response = {
            response_type: 'in_channel',
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `📝 *Summary:*\n${summary}`,
                },
              },
            ],
          };
        }
        break;

      default:
        // Treat unknown commands as questions
        const defaultAnswer = await generateGenieResponse(`${command} ${args}`.trim());
        response = {
          response_type: 'in_channel',
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `🧞 *Genie:*\n${defaultAnswer}`,
              },
            },
          ],
        };
    }
    
    const duration = Date.now() - startTime;
    console.log('[SLACK_COMMAND] Command processed:', {
      teamId: config.teamId,
      teamName: config.teamName,
      command,
      userId,
      channelId,
      duration,
    });
  } catch (error: any) {
    console.error('[SLACK_COMMAND] Error processing command:', error.message || error);
    response = {
      response_type: 'ephemeral',
      text: '❌ Sorry, I encountered an error processing your request. Please try again.',
    };
  }

  // Send the response via response_url
  const sent = await sendDelayedResponse(responseUrl, response);
  if (!sent) {
    console.error('[SLACK_COMMAND] Failed to send response via response_url');
  }
}

export async function POST(req: Request) {
  console.log('[SLACK_COMMAND] ========== Received slash command request ==========');

  try {
    const rawBody = await req.text();
    console.log('[SLACK_COMMAND] Raw body length:', rawBody.length);

    const timestamp = req.headers.get('x-slack-request-timestamp') || '';
    const signature = req.headers.get('x-slack-signature') || '';

    // Verify Slack signature in production
    if (process.env.NODE_ENV === 'production' && process.env.SLACK_SIGNING_SECRET) {
      if (!verifySlackSignature(rawBody, timestamp, signature)) {
        console.error('[SLACK_COMMAND] Invalid Slack signature');
        return new NextResponse('Unauthorized', { status: 401 });
      }
      console.log('[SLACK_COMMAND] Signature verified');
    }

    // Parse form data (Slack sends as application/x-www-form-urlencoded)
    const params = new URLSearchParams(rawBody);
    const text = params.get('text') || '';
    const responseUrl = params.get('response_url') || '';
    const userId = params.get('user_id') || '';
    const channelId = params.get('channel_id') || '';
    const userName = params.get('user_name') || '';
    const commandName = params.get('command') || '';
    const teamId = params.get('team_id') || '';
    const teamDomain = params.get('team_domain') || '';

    console.log('[SLACK_COMMAND] Parsed command:', {
      command: commandName,
      text: text.substring(0, 50) + (text.length > 50 ? '...' : ''),
      userId,
      channelId,
      teamId,
      teamDomain,
      hasResponseUrl: !!responseUrl,
      responseUrlLength: responseUrl.length,
    });

    // ─────────────────────────────────────────────────────────────────
    // Extract Team ID (CRITICAL FOR MULTI-TENANCY)
    // ─────────────────────────────────────────────────────────────────
    if (!teamId) {
      console.error('[SLACK_COMMAND] No team_id in request');
      return NextResponse.json({
        response_type: 'ephemeral',
        text: '❌ Missing team information. Please try again.',
      });
    }

    // ─────────────────────────────────────────────────────────────────
    // Fetch Dynamic Credentials for this Workspace
    // ─────────────────────────────────────────────────────────────────
    let config: SlackConfig;
    try {
      config = await getSlackConfig(teamId);
      console.log('[SLACK_COMMAND] Config resolved for team:', config.teamName);
    } catch (configError: any) {
      console.error(`[SLACK_COMMAND] No installation for team ${teamId}:`, configError.message);
      return NextResponse.json({
        response_type: 'ephemeral',
        text: '❌ This workspace is not connected to Genie. Please reinstall the app from the Genie dashboard.',
      });
    }

    // Parse command and arguments
    const parts = text.trim().split(/\s+/);
    const command = parts[0] || '';
    const args = parts.slice(1).join(' ');

    console.log('[SLACK_COMMAND] Parsed:', { command, argsLength: args.length });

    // Check if we have a response_url
    if (!responseUrl) {
      console.error('[SLACK_COMMAND] No response_url provided');
      return NextResponse.json({
        response_type: 'ephemeral',
        text: '❌ Unable to send response. Please try again.',
      });
    }

    // For help command, respond immediately since it doesn't need AI
    if (command === 'help' || command === '') {
      console.log('[SLACK_COMMAND] Returning help immediately');
      return NextResponse.json(getHelpMessage());
    }

    // For commands that need AI, respond immediately with acknowledgment
    // Then process asynchronously
    console.log('[SLACK_COMMAND] Starting async processing');
    
    // Process command asynchronously (don't await)
    processCommand(config, command, args, responseUrl, userId, channelId)
      .then(() => {
        console.log('[SLACK_COMMAND] Async processing completed');
      })
      .catch((err) => {
        console.error('[SLACK_COMMAND] Async processing error:', err);
      });

    // Return immediate acknowledgment
    console.log('[SLACK_COMMAND] Sending immediate acknowledgment');
    return NextResponse.json({
      response_type: 'ephemeral',
      text: `🧞 _Processing your request..._\n\n> ${text}`,
    });
  } catch (error: any) {
    console.error('[SLACK_COMMAND_ERROR]', error.message || error);
    return NextResponse.json({
      response_type: 'ephemeral',
      text: '❌ An error occurred. Please try again.',
    });
  }
}

// Add GET handler for testing/health check
export async function GET(req: Request) {
  return NextResponse.json({
    status: 'Slack Command endpoint active',
    version: '2.0.0', // Multi-tenant version
    timestamp: new Date().toISOString(),
    googleApiKey: process.env.GOOGLE_API_KEY ? 'SET' : 'NOT SET',
  });
}
