/**
 * Slack Slash Command Handler
 * Handles /genie commands from Slack
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
 * Send delayed response to Slack
 */
async function sendDelayedResponse(
  responseUrl: string,
  payload: Record<string, any>
): Promise<void> {
  await fetch(responseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
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
  } catch (error) {
    console.error('Error generating Genie response:', error);
    return "I apologize, but I encountered an error processing your request. Please try again.";
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
 */
async function processCommand(
  command: string,
  args: string,
  responseUrl: string,
  userId: string,
  channelId: string
): Promise<void> {
  let response: Record<string, any>;

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
  } catch (error) {
    console.error('Error processing command:', error);
    response = {
      response_type: 'ephemeral',
      text: '❌ Sorry, I encountered an error processing your request. Please try again.',
    };
  }

  // Send the response
  await sendDelayedResponse(responseUrl, response);
}

export async function POST(req: Request) {
  console.log('[SLACK_COMMAND] Received slash command request');
  
  try {
    const rawBody = await req.text();
    console.log('[SLACK_COMMAND] Raw body length:', rawBody.length);
    
    const timestamp = req.headers.get('x-slack-request-timestamp') || '';
    const signature = req.headers.get('x-slack-signature') || '';

    // Verify Slack signature in production (skip for now to debug)
    if (process.env.NODE_ENV === 'production' && process.env.SLACK_SIGNING_SECRET) {
      if (!verifySlackSignature(rawBody, timestamp, signature)) {
        console.error('[SLACK_COMMAND] Invalid Slack signature');
        return new NextResponse('Unauthorized', { status: 401 });
      }
    }

    // Parse form data (Slack sends as application/x-www-form-urlencoded)
    const params = new URLSearchParams(rawBody);
    const text = params.get('text') || '';
    const responseUrl = params.get('response_url') || '';
    const userId = params.get('user_id') || '';
    const channelId = params.get('channel_id') || '';
    const userName = params.get('user_name') || '';
    const commandName = params.get('command') || '';

    console.log('[SLACK_COMMAND] Parsed command:', {
      command: commandName,
      text,
      userId,
      channelId,
      hasResponseUrl: !!responseUrl,
    });

    // Parse command and arguments
    const parts = text.trim().split(/\s+/);
    const command = parts[0] || '';
    const args = parts.slice(1).join(' ');

    // Acknowledge immediately (Slack requires response within 3 seconds)
    const immediateResponse = {
      response_type: 'ephemeral' as const,
      text: command === 'help' || command === '' 
        ? '📖 Loading help...' 
        : `🧞 Processing your request: "${text}"...`,
    };

    // Process command asynchronously
    if (responseUrl) {
      processCommand(command, args, responseUrl, userId, channelId).catch(err => {
        console.error('[SLACK_COMMAND] Processing error:', err);
      });
    }

    console.log('[SLACK_COMMAND] Sending immediate response');
    return NextResponse.json(immediateResponse);
  } catch (error: any) {
    console.error('[SLACK_COMMAND_ERROR]', error);
    return NextResponse.json({
      response_type: 'ephemeral',
      text: '❌ An error occurred. Please try again.',
    });
  }
}

// Add GET handler for testing
export async function GET(req: Request) {
  return NextResponse.json({ 
    status: 'Slack Command endpoint active',
    timestamp: new Date().toISOString()
  });
}
