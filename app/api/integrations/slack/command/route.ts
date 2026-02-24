import { validateWebhookUrl } from '@/lib/security/urlValidator';
/**
 * Slack Slash Command Handler (Multi-Tenant) v3.1
 * 
 * Enhanced with Code Assistant capabilities:
 * - Automatic code detection and language identification
 * - Intent detection (debug, explain, generate, etc.)
 * - Code-specific prompts and formatting
 * - New code subcommands: debug, review, convert, test
 * 
 * Supported commands:
 * - /genie help - Show available commands
 * - /genie ask [question] - Ask Genie anything
 * - /genie code [request] - Get coding help (auto-detects intent)
 * - /genie debug [code] - Debug code
 * - /genie review [code] - Review code quality
 * - /genie explain [topic/code] - Get an explanation
 * - /genie summarize [text] - Summarize text
 * - /genie [anything] - Treat as a question (auto-detects code)
 */

import { NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import crypto from 'crypto';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import { getSlackConfig, SlackConfig } from '@/lib/slack/tokenManager';
import { getRandomLoadingMessage } from '@/lib/slack/assistantHelpers';
import {
  isCodeRelated,
  detectLanguage,
  detectCodeIntent,
  buildCodePrompt,
  convertMarkdownToSlack,
  getIntentEmoji,
  getIntentLabel,
  getLanguageDisplayName,
  CODE_SYSTEM_PROMPT,
  CodeIntent,
} from '@/lib/slack/codeAssistant';

const SLACK_API_BASE = 'https://slack.com/api';

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || '');

// General assistant model
const generalModel = genAI.getGenerativeModel({
  model: "gemini-2.0-flash",
  safetySettings: [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  ],
});


// Code-specific model
const codeModel = genAI.getGenerativeModel({
  model: "gemini-2.0-flash",
  systemInstruction: {
    role: "user",
    parts: [{ text: CODE_SYSTEM_PROMPT }],
  },
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
    const ssrfCheck = validateWebhookUrl(responseUrl);
    if (!ssrfCheck.valid) {
      console.error('[SLACK_CMD] Blocked SSRF via response_url:', ssrfCheck.reason);
      return;
    }
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
 * Generate general AI response using Gemini
 */
async function generateGenieResponse(userMessage: string): Promise<string> {
  try {
    const chat = generalModel.startChat({
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
 * Generate code-specific AI response using Gemini
 */
async function generateCodeResponse(
  userMessage: string,
  language: string | null,
  intent: CodeIntent
): Promise<string> {
  try {
    const prompt = buildCodePrompt(userMessage, {
      detectedLanguage: language,
      intent,
    });

    const chat = codeModel.startChat({
      generationConfig: {
        temperature: 0.3, // Lower temperature for more precise code
        topK: 40,
        topP: 0.8,
        maxOutputTokens: 2048, // More tokens for code responses
      },
    });

    const result = await chat.sendMessage(prompt);
    const response = result.response.text();

    // Convert markdown to Slack format
    return convertMarkdownToSlack(response);
  } catch (error: any) {
    console.error('[SLACK_COMMAND] Code generation error:', error.message);
    throw error;
  }
}

/**
 * Get loading message based on intent
 */
function getCodeLoadingMessage(intent: CodeIntent): string {
  const messages: Record<CodeIntent, string[]> = {
    debugging: ['🐛 Analyzing the bug...', '🔍 Looking for issues...'],
    explanation: ['📚 Analyzing the code...', '🔍 Breaking it down...'],
    generation: ['💻 Writing code...', '⌨️ Coding...'],
    review: ['🔍 Reviewing code...', '📋 Checking quality...'],
    optimization: ['⚡ Optimizing...', '🚀 Finding improvements...'],
    conversion: ['🔄 Converting code...', '🔀 Translating...'],
    documentation: ['📝 Writing docs...', '📄 Documenting...'],
    testing: ['🧪 Writing tests...', '✅ Creating test cases...'],
    refactoring: ['🔧 Refactoring...', '🛠️ Restructuring...'],
  };

  const intentMessages = messages[intent];
  return intentMessages[Math.floor(Math.random() * intentMessages.length)];
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
          text: '*General Commands:*',
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '`/genie help` - Show this help message\n`/genie ask [question]` - Ask Genie anything\n`/genie explain [topic]` - Get an explanation\n`/genie summarize [text]` - Summarize text',
        },
      },
      {
        type: 'divider',
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*💻 Code Commands:*',
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '`/genie code [request]` - Write or help with code\n`/genie debug [code]` - Find and fix bugs\n`/genie review [code]` - Get code review feedback\n`/genie test [code]` - Generate unit tests\n`/genie optimize [code]` - Improve performance',
        },
      },
      {
        type: 'divider',
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Quick Tips:*\n• Genie auto-detects code in your messages\n• Include code blocks with \\`\\`\\` for better results\n• Mention the programming language for accuracy\n• You can also @mention Genie or DM directly',
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: '💡 _Examples:_\n`/genie code Write a Python function to sort a list`\n`/genie debug Why does this throw an error: const x = undefined.map()`',
          },
        ],
      },
    ],
  };
}

/**
 * Create feedback blocks for responses
 */
function createFeedbackBlocks(prompt: string): any[] {
  return [
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: '👍', emoji: true },
          action_id: 'feedback_helpful',
          value: prompt.substring(0, 200),
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: '👎', emoji: true },
          action_id: 'feedback_not_helpful',
          value: prompt.substring(0, 200),
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: '🔄 Regenerate', emoji: true },
          action_id: 'regenerate_response',
          value: prompt.substring(0, 500),
        },
      ],
    },
  ];
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
  let isCodeCommand = false;
  let detectedLanguage: string | null = null;
  let intent: CodeIntent = 'generation';

  switch (command.toLowerCase()) {
    case 'ask':
      if (!args) {
        return {
          response_type: 'ephemeral',
          text: '❓ Please provide a question. Example: `/genie ask What is machine learning?`',
        };
      }
      // Check if the question is code-related
      if (isCodeRelated(args)) {
        isCodeCommand = true;
        detectedLanguage = detectLanguage(args);
        intent = detectCodeIntent(args);
      }
      prompt = args;
      prefix = isCodeCommand ? getIntentLabel(intent) : 'Answer';
      emoji = isCodeCommand ? getIntentEmoji(intent) : '🧞';
      break;

    case 'code':
      if (!args) {
        return {
          response_type: 'ephemeral',
          text: '💻 Please describe what code you need.\n\n*Examples:*\n• `/genie code Write a Python function to reverse a string`\n• `/genie code Create a React component for a login form`\n• `/genie code SQL query to find duplicate records`',
        };
      }
      isCodeCommand = true;
      detectedLanguage = detectLanguage(args);
      intent = detectCodeIntent(args);
      prompt = args;
      prefix = getIntentLabel(intent);
      emoji = getIntentEmoji(intent);
      break;

    case 'debug':
      if (!args) {
        return {
          response_type: 'ephemeral',
          text: '🐛 Please provide code to debug.\n\n*Example:*\n`/genie debug const x = undefined.map(y => y * 2)`',
        };
      }
      isCodeCommand = true;
      detectedLanguage = detectLanguage(args);
      intent = 'debugging';
      prompt = `Debug this code and explain the issue: ${args}`;
      prefix = 'Debug';
      emoji = '🐛';
      break;

    case 'review':
      if (!args) {
        return {
          response_type: 'ephemeral',
          text: '🔍 Please provide code to review.\n\n*Example:*\n`/genie review function add(a,b){return a+b}`',
        };
      }
      isCodeCommand = true;
      detectedLanguage = detectLanguage(args);
      intent = 'review';
      prompt = `Review this code for quality, bugs, and improvements: ${args}`;
      prefix = 'Review';
      emoji = '🔍';
      break;

    case 'test':
      if (!args) {
        return {
          response_type: 'ephemeral',
          text: '🧪 Please provide code to generate tests for.\n\n*Example:*\n`/genie test function multiply(a, b) { return a * b; }`',
        };
      }
      isCodeCommand = true;
      detectedLanguage = detectLanguage(args);
      intent = 'testing';
      prompt = `Write comprehensive unit tests for this code: ${args}`;
      prefix = 'Tests';
      emoji = '🧪';
      break;

    case 'engineer':
      if (!args) {
        return {
          response_type: 'ephemeral',
          text: '🦞 Please describe the engineering task.\n\n*Example:*\n`/genie engineer Add a health check endpoint at /api/health`',
        };
      }
      return await dispatchEngineerPlanning(args, userId);

    case 'optimize':
      if (!args) {
        return {
          response_type: 'ephemeral',
          text: '⚡ Please provide code to optimize.\n\n*Example:*\n`/genie optimize for(let i=0;i<arr.length;i++){...}`',
        };
      }
      isCodeCommand = true;
      detectedLanguage = detectLanguage(args);
      intent = 'optimization';
      prompt = `Optimize this code for better performance: ${args}`;
      prefix = 'Optimization';
      emoji = '⚡';
      break;

    case 'explain':
      if (!args) {
        return {
          response_type: 'ephemeral',
          text: '📚 Please provide a topic or code to explain.\n\n*Examples:*\n• `/genie explain How does async/await work?`\n• `/genie explain arr.reduce((a,b) => a+b, 0)`',
        };
      }
      // Check if explaining code
      if (isCodeRelated(args)) {
        isCodeCommand = true;
        detectedLanguage = detectLanguage(args);
        intent = 'explanation';
      }
      prompt = isCodeCommand
        ? `Explain this code in detail: ${args}`
        : `Explain the following topic in a clear, concise way that's easy to understand. Use examples if helpful: ${args}`;
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
      // Treat the entire text as a question - auto-detect if code-related
      if (isCodeRelated(fullText)) {
        isCodeCommand = true;
        detectedLanguage = detectLanguage(fullText);
        intent = detectCodeIntent(fullText);
        prompt = fullText;
        prefix = getIntentLabel(intent);
        emoji = getIntentEmoji(intent);
      } else {
        prompt = fullText;
        prefix = 'Response';
        emoji = '🧞';
      }
  }

  // Generate AI response
  let answer: string;

  if (isCodeCommand) {
    console.log('[SLACK_COMMAND] Code request detected:', {
      language: detectedLanguage,
      intent,
    });
    answer = await generateCodeResponse(prompt, detectedLanguage, intent);
  } else {
    answer = await generateGenieResponse(prompt);
  }

  // Build language info string
  const langInfo = detectedLanguage ? ` (${getLanguageDisplayName(detectedLanguage)})` : '';

  return {
    response_type: 'in_channel',
    blocks: [
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `${emoji} *Genie ${prefix}${langInfo}* • Asked by <@${userId}>`,
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
      ...createFeedbackBlocks(fullText),
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
    const teamId = params.get('team_id') || '';

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
    } catch (error: any) {
      console.error('[SLACK_COMMAND] Config error:', error.message);
      return NextResponse.json({
        response_type: 'ephemeral',
        text: '❌ This workspace is not connected to Genie. Please reinstall the app.',
      });
    }

    const parts = text.trim().split(/\s+/);
    const command = parts[0] || '';
    const args = parts.slice(1).join(' ');

    // Handle help immediately
    if (command === 'help' || text.trim() === '') {
      return NextResponse.json(getHelpMessage());
    }

    if (!responseUrl) {
      return NextResponse.json({
        response_type: 'ephemeral',
        text: '❌ Unable to process request. Please try again.',
      });
    }

    // Determine loading message
    let loadingMessage: string;
    const codeCommands = ['code', 'debug', 'review', 'test', 'optimize', 'engineer'];

    if (codeCommands.includes(command.toLowerCase())) {
      const intentMap: Record<string, CodeIntent> = {
        code: 'generation',
        debug: 'debugging',
        review: 'review',
        test: 'testing',
        optimize: 'optimization',
        engineer: 'generation', // Treat engineer as generation or add new intent
      };
      loadingMessage = command === 'engineer'
        ? '🦞 Planning engineering task...'
        : getCodeLoadingMessage(intentMap[command.toLowerCase()]);
    } else if (isCodeRelated(text)) {
      const intent = detectCodeIntent(text);
      loadingMessage = getCodeLoadingMessage(intent);
    } else {
      loadingMessage = getRandomLoadingMessage('thinking');
    }

    // START ASYNC PROCESSING (Fire and Forget)
    // Use waitUntil to ensure Vercel doesn't kill the lambda
    waitUntil((async () => {
      try {
        console.log('[SLACK_COMMAND] Async processing started for:', command);
        const response = await buildResponse(command, args, text, userId);

        // Send to response_url
        await sendToResponseUrl(responseUrl, response);
        console.log('[SLACK_COMMAND] Async response sent successfully');
      } catch (error: any) {
        console.error('[SLACK_COMMAND] Async processing error:', error.message);
        await sendToResponseUrl(responseUrl, {
          response_type: 'ephemeral',
          text: `❌ Sorry, I encountered an error: ${error.message || 'Unknown error'}. Please try again.`,
        });
      }
    })());

    // Return immediate acknowledgement
    return NextResponse.json({
      response_type: 'ephemeral',
      text: `*${loadingMessage}*`,
    });

  } catch (error: any) {
    console.error('[SLACK_COMMAND] Fatal error:', error.message);
    return NextResponse.json({
      response_type: 'ephemeral',
      text: '❌ An error occurred. Please try again.',
    });
  }
}

/**
 * Dispatch planning to engineer script
 */
async function dispatchEngineerPlanning(task: string, userId: string): Promise<Record<string, any>> {
  if (process.env.NODE_ENV === 'production' || !process.env.GENIE_LOCAL) {
    return { response_type: 'ephemeral', text: '⚙️ Engineering tasks are only available in local development mode.' };
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { execFileSync } = require('child_process') as typeof import('child_process');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path') as typeof import('path');
    const scriptPath = path.join(process.cwd(), '.agent', 'skills', 'genie-context', 'scripts', ['engineer', 'mjs'].join('.'));
    const output = execFileSync('node', [scriptPath, task, '--plan-only'], {
      encoding: 'utf-8',
      env: { ...process.env, GOOGLE_API_KEY: process.env.GOOGLE_API_KEY }
    });

    const jsonMatch = output.match(/---JSON_START---([\s\S]*?)---JSON_END---/);
    if (!jsonMatch) throw new Error('Failed to parse engineer plan output');

    const plan = JSON.parse(jsonMatch[1]);

    return {
      response_type: 'in_channel',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `🦞 *GenieBot Engineering Plan*\n\n*Task:* ${task}\n\n*Proposed Plan:* ${plan.plan}`
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Steps to Execute:*\n${plan.steps.map((s: any, i: number) => `${i + 1}. \`${s.type}\`: ${s.path || s.command}`).join('\n')}`
          }
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: '✅ Approve & Execute', emoji: true },
              action_id: 'engineer_approve',
              style: 'primary',
              value: JSON.stringify({ task, plan })
            },
            {
              type: 'button',
              text: { type: 'plain_text', text: '❌ Cancel', emoji: true },
              action_id: 'engineer_cancel',
              style: 'danger',
              value: task
            }
          ]
        }
      ]
    };
  } catch (error: any) {
    console.error('[SLACK_COMMAND] Engineer dispatch error:', error.message);
    return {
      response_type: 'ephemeral',
      text: `❌ Failed to dispatch engineering task: ${error.message}`
    };
  }
}

export async function GET(req: Request) {
  return NextResponse.json({
    status: 'Slack Command endpoint active',
    version: '3.1.0', // Code Assistant version
    features: [
      'multi-tenant',
      'feedback-blocks',
      'loading-states',
      'code-detection',
      'language-detection',
      'intent-detection',
      'code-commands',
    ],
    commands: [
      '/genie help',
      '/genie ask',
      '/genie code',
      '/genie debug',
      '/genie review',
      '/genie test',
      '/genie optimize',
      '/genie explain',
      '/genie summarize',
    ],
    timestamp: new Date().toISOString(),
    googleApiKey: process.env.GOOGLE_API_KEY ? 'SET' : 'NOT SET',
  });
}
