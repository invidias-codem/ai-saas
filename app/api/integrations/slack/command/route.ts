import { execFileSync } from 'child_process';
import path from 'path';
import { validateWebhookUrl } from '@/lib/security/urlValidator';
import { requireSlackSignature } from '@/lib/slack/slackVerification';
import { emitSlackTelemetry, extractTelemetryFields } from '@/lib/slack/slackTelemetry';
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
 * Security hardened: enforced signature verification, retry guard, idempotency, structured telemetry.
 */

import { NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
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
  model: "gemini-2.5-flash",
  safetySettings: [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  ],
});


// Code-specific model
const codeModel = genAI.getGenerativeModel({
  model: "gemini-2.5-flash",
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
      return false;
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
  userId: string,
  channelId: string,
  teamId: string,
  channelName: string,
  botToken: string
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

    case 'index':
      // Enable auto-indexing for this channel (requires admin)
      return handleIndexCommand(channelId, teamId, userId, channelName, args, botToken);

    case 'stop-indexing':
      // Disable auto-indexing for this channel (requires admin)
      return handleStopIndexCommand(channelId, teamId, userId, botToken);

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

    // 1. Verify Slack Signature FIRST (before any retry/idempotency logic)
    const sigCheck = requireSlackSignature(req, rawBody);
    if (sigCheck) {
      emitSlackTelemetry({
        type: 'slack_signature_invalid',
        teamId: 'unknown',
        eventType: 'command',
        channelId: '',
        threadTs: '',
        userId: '',
        error: sigCheck.status === 500 ? 'missing_secret' : 'invalid_signature'
      });
      return sigCheck;
    }

    // Parse form data
    const params = new URLSearchParams(rawBody);
    const text = params.get('text') || '';
    const responseUrl = params.get('response_url') || '';
    const userId = params.get('user_id') || '';
    const teamId = params.get('team_id') || '';
    const channelId = params.get('channel_id') || '';
    const channelName = params.get('channel_name') || channelId;

    // Validate team_id
    if (!teamId) {
      emitSlackTelemetry({
        type: 'slack_config_missing',
        teamId: 'unknown',
        eventType: 'command',
        channelId: '',
        threadTs: '',
        userId: '',
        error: 'missing_team_id'
      });
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
      emitSlackTelemetry({
        type: 'slack_config_missing',
        teamId,
        eventType: 'command',
        channelId,
        threadTs: '',
        userId,
        error: error.message
      });
      return NextResponse.json({
        response_type: 'ephemeral',
        text: '❌ This workspace is not connected to Genie. Please reinstall the app.',
      });
    }
    // Definite assignment assertion for TypeScript
    const cfg = config!;

    // 2. Retry Handling — signature verified, now check for retries
    // Durable idempotency (Supabase event tracking) is S2 work.
    // For S1: log retries but continue processing; S2 will add deduplication.
    if (req.headers.has('x-slack-retry-num')) {
      const retryNum = req.headers.get('x-slack-retry-num');
      const retryReason = req.headers.get('x-slack-retry-reason') || 'unknown';
      emitSlackTelemetry({
        type: 'slack_retry_received',
        teamId: cfg.teamId,
        eventType: 'command',
        channelId: cfg.teamId, // slack teamId as channel scope for commands
        threadTs: '',
        userId: userId,
        metadata: { retryNum, retryReason, command: text.split(' ')[0] }
      });
      // S1: Do NOT short-circuit. Continue to handler — S2 adds durable idempotency.
    }

    const parts = text.trim().split(/\s+/);
    const command = parts[0] || '';
    const args = parts.slice(1).join(' ');

    // Telemetry base
    const telemetryBase = extractTelemetryFields(cfg, { type: 'command', channel: channelId, channel_id: channelId, user: userId, ts: '' });

    // Handle help immediately
    if (command === 'help' || text.trim() === '') {
      emitSlackTelemetry({
        ...telemetryBase,
        type: 'slack_event_received',
        metadata: { command: 'help' }
      });
      return NextResponse.json(getHelpMessage());
    }

    if (!responseUrl) {
      return NextResponse.json({
        response_type: 'ephemeral',
        text: '❌ Unable to process request. Please try again.',
      });
    }

    // Idempotency key for commands — use Slack request timestamp (stable across retries)
// Slack includes x-slack-request-timestamp which is the same for retries of the same request
    const slackTimestamp = req.headers.get('x-slack-request-timestamp');
    if (!slackTimestamp) {
      return NextResponse.json({
        response_type: 'ephemeral',
        text: '❌ Missing x-slack-request-timestamp header.',
      });
    }
    const idempotencyKey = `slack:cmd:${teamId}:${userId}:${command}:${slackTimestamp}`;

    emitSlackTelemetry({
      ...telemetryBase,
      type: 'slack_event_received',
      metadata: { idempotencyKey, command, argsLength: args.length }
    });

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
        engineer: 'generation',
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
        const response = await buildResponse(command, args, text, userId, channelId, teamId, channelName, cfg.botToken);

        // Send to response_url
        await sendToResponseUrl(responseUrl, response);
        console.log('[SLACK_COMMAND] Async response sent successfully');
        
        emitSlackTelemetry({
          ...telemetryBase,
          type: 'slack_stream_completed',
          durationMs: Date.now() - startTime,
          metadata: { command, idempotencyKey }
        });
      } catch (error: any) {
        console.error('[SLACK_COMMAND] Async processing error:', error.message);
        await sendToResponseUrl(responseUrl, {
          response_type: 'ephemeral',
          text: `❌ Sorry, I encountered an error: ${error.message || 'Unknown error'}. Please try again.`,
        });
        
        emitSlackTelemetry({
          ...telemetryBase,
          type: 'slack_stream_failed',
          durationMs: Date.now() - startTime,
          error: error.message,
          metadata: { command, idempotencyKey }
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
 * Check if a Slack user is an admin in the workspace
 */
async function isSlackAdmin(botToken: string, teamId: string, userId: string): Promise<boolean> {
  try {
    // Check if user is in admin usergroup or is workspace owner/admin
    // First try to get user info
    const userInfoRes = await fetch(`https://slack.com/api/users.info?user=${userId}`, {
      headers: { 'Authorization': `Bearer ${botToken}` }
    });
    const userInfo = await userInfoRes.json();
    if (userInfo.ok && userInfo.user?.is_admin) return true;
    if (userInfo.ok && userInfo.user?.is_owner) return true;
    if (userInfo.ok && userInfo.user?.is_primary_owner) return true;

    // Also check if user is in the admin usergroup (ID usually starts with SUP)
    const usergroupsRes = await fetch(`https://slack.com/api/usergroups.list`, {
      headers: { 'Authorization': `Bearer ${botToken}` }
    });
    const usergroups = await usergroupsRes.json();
    if (usergroups.ok && usergroups.usergroups) {
      for (const ug of usergroups.usergroups) {
        if (ug.name === 'admin' || ug.name === 'administrators') {
          const membersRes = await fetch(`https://slack.com/api/usergroups.users.list?usergroup=${ug.id}`, {
            headers: { 'Authorization': `Bearer ${botToken}` }
          });
          const members = await membersRes.json();
          if (members.ok && members.users?.includes(userId)) return true;
        }
      }
    }
    return false;
  } catch (error) {
    console.error('[SLACK_COMMAND] Admin check failed:', error);
    return false;
  }
}

/**
 * Handle /genie index command - enable auto-indexing for a channel (requires admin)
 */
async function handleIndexCommand(
  channelId: string,
  teamId: string,
  userId: string,
  channelName: string,
  args: string,
  botToken: string
): Promise<Record<string, any>> {
  // Require admin permission
  const isAdmin = await isSlackAdmin(botToken, teamId, userId);
  if (!isAdmin) {
    return {
      response_type: 'ephemeral',
      text: '❌ Only workspace admins can enable auto-indexing.',
    };
  }
  try {
    const { enableIndexingChannel } = await import('@/lib/slack/channelIndexer');
    await enableIndexingChannel(teamId, channelId, channelName, userId);
    
    return {
      response_type: 'in_channel',
      text: `✅ Auto-indexing enabled for this channel. Genie will now learn from conversations to provide better context-aware responses.`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `✅ *Auto-indexing enabled*\n\nGenie will now continuously learn from conversations in this channel to provide better context-aware responses.`,
          },
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `Enabled by <@${userId}> • Use \`/genie stop-indexing\` to disable`,
            },
          ],
        },
      ],
    };
  } catch (error: any) {
    console.error('[SLACK_COMMAND] Index error:', error.message);
    return {
      response_type: 'ephemeral',
      text: `❌ Failed to enable auto-indexing: ${error.message}`,
    };
  }
}

/**
 * Handle /genie stop-indexing command - disable auto-indexing for a channel (requires admin)
 */
async function handleStopIndexCommand(
  channelId: string,
  teamId: string,
  userId: string,
  botToken: string
): Promise<Record<string, any>> {
  // Require admin permission
  const isAdmin = await isSlackAdmin(botToken, teamId, userId);
  if (!isAdmin) {
    return {
      response_type: 'ephemeral',
      text: '❌ Only workspace admins can disable auto-indexing.',
    };
  }
  try {
    const { stopIndexingChannel } = await import('@/lib/slack/channelIndexer');
    await stopIndexingChannel(teamId, channelId);
    
    return {
      response_type: 'in_channel',
      text: `🛑 Auto-indexing disabled for this channel. Previously indexed content will be retained but no new conversations will be indexed.`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `🛑 *Auto-indexing disabled*\n\nGenie will no longer learn from new conversations in this channel. Previously indexed content is still available.`,
          },
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `Disabled by <@${userId}> • Use \`/genie index\` to re-enable`,
            },
          ],
        },
      ],
    };
  } catch (error: any) {
    console.error('[SLACK_COMMAND] Stop-index error:', error.message);
    return {
      response_type: 'ephemeral',
      text: `❌ Failed to disable auto-indexing: ${error.message}`,
    };
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
    const { execFileSync } = require('child_process') as typeof import('child_process');
    const path = require('path') as typeof import('path');
    // Sourced from env so Turbopack cannot statically trace it as a module
    const scriptPath = process.env.ENGINEER_SCRIPT_PATH as string;
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
