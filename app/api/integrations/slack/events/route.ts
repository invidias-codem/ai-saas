/**
 * Slack Events API Endpoint (Multi-Tenant) v3.2
 * 
 * Enhanced with Thread-Level Memory and App Home features.
 */

import fs from 'fs';
import path from 'path';

// Helper to log to file (for debugging when terminal is inaccessible)
function logDebug(message: string, data?: any) {
  // Disable file logging in production to prevent PII leakage and ephemeral filesystem issues
  if (process.env.NODE_ENV === 'production') {
    return;
  }
  try {
    const logPath = path.join(process.cwd(), 'debug_slack.log');
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}\n${data ? JSON.stringify(data, null, 2) + '\n' : ''}`;
    fs.appendFileSync(logPath, logEntry);
  } catch (e) {
    // Ignore logging errors
  }
}
import { NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import crypto from 'crypto';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import {
  getSlackConfig,
  SlackConfig,
  getThreadHistory,
  updateThreadHistory,
  SlackThreadMessage,
  publishAppHome,
} from '@/lib/slack';
import {
  setAssistantStatus,
  clearAssistantStatus,
  cycleLoadingMessages,
  setSuggestedPrompts,
  DEFAULT_GENIE_PROMPTS,
  getContextAwarePrompts,
  setThreadTitle,
  generateThreadTitle,
  startStream,
  appendStream,
  stopStream,
  createFeedbackBlocks,
  createStreamer,
  getRandomLoadingMessage,
  getWelcomeMessageBlocks,
  getChannelHistory,
  shouldFetchContext,
} from '@/lib/slack/assistantHelpers';
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
  KINDNESS_SYSTEM_PROMPT,
  CODE_SUGGESTED_PROMPTS,
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

// Code-specific model with specialized system prompt
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
    logDebug('Slack API Error in sendSlackMessage:', data.error);
  } else {
    logDebug('Slack Message Sent Successfully:', data.ts);
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
 * Create standard feedback blocks (for non-AI container responses)
 */
function createStandardFeedbackBlocks(prompt: string): any[] {
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
 * Generate general AI response using Gemini with streaming
 */
async function* generateGenieResponseStream(
  userMessage: string,
  history: SlackThreadMessage[] = [],
  contextMessages: string = ""
): AsyncGenerator<string, void, unknown> {
  try {
    const sanitizedHistory = sanitizeHistory(history);

    // Inject context if provided
    let finalSystemPrompt = KINDNESS_SYSTEM_PROMPT;
    if (contextMessages) {
      finalSystemPrompt += `\n\nCONTEXT FROM CHANNEL HISTORY (Use this to be aware of the "vibe" and topics discussed):\n${contextMessages}`;
    }

    const chat = generalModel.startChat({
      history: [
        {
          role: "user",
          parts: [{ text: finalSystemPrompt }],
        },
        ...sanitizedHistory as any,
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
 * Helper to sanitize history for Gemini (alternating roles)
 */
function sanitizeHistory(history: SlackThreadMessage[]): { role: string; parts: { text: string }[] }[] {
  const sanitized: { role: string; parts: { text: string }[] }[] = [];

  if (history.length === 0) return sanitized;

  let lastRole = '';
  let currentContent = '';

  for (const msg of history) {
    const role = msg.role === 'user' ? 'user' : 'model';
    const content = msg.content || ' ';

    if (role === lastRole) {
      // Merge with previous message
      sanitized[sanitized.length - 1].parts[0].text += `\n\n${content}`;
    } else {
      sanitized.push({ role, parts: [{ text: content }] });
      lastRole = role;
    }
  }

  return sanitized;
}

/**
 * Generate code-specific AI response using Gemini with streaming
 */
async function* generateCodeResponseStream(
  userMessage: string,
  language: string | null,
  intent: CodeIntent,
  history: SlackThreadMessage[] = []
): AsyncGenerator<string, void, unknown> {
  try {
    // Build optimized prompt for code
    const prompt = buildCodePrompt(userMessage, {
      detectedLanguage: language,
      intent,
    });

    const sanitizedHistory = sanitizeHistory(history);

    const chat = codeModel.startChat({
      history: sanitizedHistory as any,
      generationConfig: {
        temperature: 0.3, // Lower temperature for more precise code
        topK: 40,
        topP: 0.8,
        maxOutputTokens: 2048, // More tokens for code responses
      },
    });

    const result = await chat.sendMessageStream(prompt);

    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) {
        yield text;
      }
    }
  } catch (error) {
    console.error('[SLACK_EVENTS] Error generating code response:', error);
    yield "I apologize, but I encountered an error processing your code request. Please try again.";
  }
}

/**
 * Generate general AI response (non-streaming fallback)
 */
async function generateGenieResponse(
  userMessage: string,
  history: SlackThreadMessage[] = []
): Promise<string> {
  try {
    // Ensure history roles are alternating by sanitizing
    const sanitizedHistory = sanitizeHistory(history);

    // Inject context if provided
    let finalSystemPrompt = KINDNESS_SYSTEM_PROMPT;
    // Note: In non-streaming fallback, we might not have easy access to context without prop drilling
    // For now we use the base prompt, but ideally this function should also accept contextMessages

    const chat = generalModel.startChat({
      history: [
        {
          role: "user",
          parts: [{ text: finalSystemPrompt }],
        },
        {
          role: "model",
          parts: [{ text: "I understand! I'm Genie, and I am ready to match my Killer Kindness persona! ✨" }],
        },
        ...sanitizedHistory as any,
      ],
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.8,
        maxOutputTokens: 1024,
      },
    });

    const result = await chat.sendMessage(userMessage);
    const text = result.response.text();

    if (!text || text.trim().length === 0) {
      throw new Error('Empty response from AI model');
    }

    return text;
  } catch (error) {
    console.error('[SLACK_EVENTS] Error generating Genie response:', error);
    return "I apologize, but I encountered an error processing your request. Please try again.";
  }
}

/**
 * Generate code-specific AI response (non-streaming fallback)
 */
async function generateCodeResponse(
  userMessage: string,
  language: string | null,
  intent: CodeIntent,
  history: SlackThreadMessage[] = []
): Promise<string> {
  try {
    const prompt = buildCodePrompt(userMessage, {
      detectedLanguage: language,
      intent,
    });

    const sanitizedHistory = sanitizeHistory(history);

    const chat = codeModel.startChat({
      history: sanitizedHistory as any,
      generationConfig: {
        temperature: 0.3,
        topK: 40,
        topP: 0.8,
        maxOutputTokens: 2048,
      },
    });

    const result = await chat.sendMessage(prompt);
    const response = result.response.text();

    if (!response || response.trim().length === 0) {
      throw new Error('Empty response from AI model');
    }

    // Convert markdown to Slack format
    return convertMarkdownToSlack(response);
  } catch (error) {
    console.error('[SLACK_EVENTS] Error generating code response:', error);
    return "I apologize, but I encountered an error processing your code request. Please try again.";
  }
}

/**
 * Get loading message based on whether it's a code request
 */
function getSmartLoadingMessage(isCode: boolean, intent?: CodeIntent): string {
  if (isCode) {
    const codeMessages: Record<CodeIntent, string[]> = {
      debugging: ['🐛 Analyzing the bug...', '🔍 Looking for issues...', '🐛 Debugging...'],
      explanation: ['📚 Analyzing the code...', '🔍 Breaking it down...', '📖 Reading through...'],
      generation: ['💻 Writing code...', '⌨️ Coding...', '🔨 Building...'],
      review: ['🔍 Reviewing code...', '📋 Checking quality...', '🧐 Analyzing...'],
      optimization: ['⚡ Optimizing...', '🚀 Finding improvements...', '📈 Analyzing performance...'],
      conversion: ['🔄 Converting code...', '🔀 Translating...', '🔄 Porting...'],
      documentation: ['📝 Writing docs...', '📄 Documenting...', '✍️ Adding comments...'],
      testing: ['🧪 Writing tests...', '✅ Creating test cases...', '🔬 Testing...'],
      refactoring: ['🔧 Refactoring...', '🛠️ Restructuring...', '✨ Cleaning up...'],
    };

    const messages = intent ? codeMessages[intent] : codeMessages.generation;
    return messages[Math.floor(Math.random() * messages.length)];
  }

  return getRandomLoadingMessage('thinking');
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
      "🧞 Hi! I'm Genie, your AI assistant.", // Fallback text
      thread_ts,
      getWelcomeMessageBlocks()
    );

    // Set suggested prompts - mix of general and code prompts
    const hasChannelContext = context?.channel_id != null;
    const generalPrompts = getContextAwarePrompts(hasChannelContext);

    // Combine general and code prompts
    const combinedPrompts = [
      generalPrompts[0], // First general prompt
      CODE_SUGGESTED_PROMPTS[0], // Write code
      CODE_SUGGESTED_PROMPTS[1], // Debug code
      generalPrompts[1], // Second general prompt
    ];

    await setSuggestedPrompts(
      config.botToken,
      channel_id,
      thread_ts,
      "What can I help you with?",
      combinedPrompts
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
    const generalPrompts = getContextAwarePrompts(hasChannelContext);

    // Combine general and code prompts
    const combinedPrompts = [
      generalPrompts[0],
      CODE_SUGGESTED_PROMPTS[0],
      CODE_SUGGESTED_PROMPTS[1],
      generalPrompts[1],
    ];

    await setSuggestedPrompts(
      config.botToken,
      channel_id,
      thread_ts,
      hasChannelContext ? "Actions for this channel:" : "What can I help you with?",
      combinedPrompts
    );
  } catch (error) {
    console.error('[SLACK_EVENTS] Error handling context change:', error);
  }
}

/**
 * Handle app_mention events with code detection
 */
async function handleAppMention(config: SlackConfig, event: any): Promise<void> {
  const { channel, text, ts, thread_ts, user } = event;

  // Remove the bot mention from the text (handle both <@U123> and <@U123|name>)
  const cleanText = text.replace(/<@[A-Z0-9]+(\|[^>]+)?>/g, '').trim();

  console.log('[SLACK_EVENTS] App mention received:', {
    rawText: text,
    cleanText,
    channel,
    ts,
    thread_ts,
  });

  if (!cleanText) {
    console.log('[SLACK_EVENTS] Clean text is empty, sending help message');
    logDebug('Clean text is empty');
    await sendSlackMessage(
      config.botToken,
      channel,
      "Hi! How can I help you? Just mention me with your question. I can also help with code - try asking me to write, debug, or explain code!",
      thread_ts || ts
    );
    return;
  }

  const threadTs = thread_ts || ts;

  // Detect if this is a code-related request
  const isCode = isCodeRelated(cleanText);
  const language = isCode ? detectLanguage(cleanText) : null;
  const intent = isCode ? detectCodeIntent(cleanText) : null;

  logDebug('Message Analysis:', { cleanText, isCode, language, intent });

  console.log('[SLACK_EVENTS] Message analysis:', {
    isCode,
    language,
    intent,
    textLength: cleanText.length,
  });

  // Set loading status with context-aware message
  await setAssistantStatus(
    config.botToken,
    channel,
    threadTs,
    getSmartLoadingMessage(isCode, intent || undefined)
  );

  try {
    const history = await getThreadHistory(config.teamId, threadTs);

    // Fetch context if the user asks for it (simple keyword check for now)
    // In a real implementation, we might use an LLM router to decide if context is needed
    // Logic extracted to shouldFetchContext for testing
    const needsContext = shouldFetchContext(cleanText);

    let contextMessages = "";
    if (needsContext) {
      console.log('[SLACK_EVENTS] Fetching channel context for request...');
      const contextResult = await getChannelHistory(config.botToken, channel, 15); // Last 15 messages
      if (contextResult.ok && contextResult.messages) {
        contextMessages = contextResult.messages
          .map((m: any) => `[${m.user}]: ${m.text}`)
          .join('\n');
      }
    }

    let fullResponse = '';
    let responseSent = false;


    // Try streaming first
    const streamer = createStreamer({
      botToken: config.botToken,
      channel,
      threadTs,
    });

    const started = await streamer.start();

    if (started) {
      // Stream the response based on type
      if (isCode && intent) {
        for await (const chunk of generateCodeResponseStream(cleanText, language, intent, history)) {
          // Convert markdown to Slack format for each chunk
          await streamer.append(convertMarkdownToSlack(chunk));
        }
      } else {
        for await (const chunk of generateGenieResponseStream(cleanText, history, contextMessages)) {
          await streamer.append(chunk);
        }
      }
      await streamer.stop();

      fullResponse = streamer.getBuffer();

      // If content was generated, we consider it sent
      if (fullResponse && fullResponse.trim().length > 0) {
        await updateThreadHistory(config.teamId, threadTs, { role: 'user', content: cleanText });
        await updateThreadHistory(config.teamId, threadTs, { role: 'model', content: fullResponse });
        responseSent = true;

        console.log('[SLACK_EVENTS] Streamed response for app_mention:', {
          teamId: config.teamId,
          channel,
          user,
          isCode,
          language,
          intent,
          inputLength: cleanText.length,
          outputLength: fullResponse.length,
          historyLength: history.length,
        });
      } else {
        console.warn('[SLACK_EVENTS] Stream produced empty response, falling back to non-streaming');
        logDebug('Stream produced empty response');
      }
    }

    if (!responseSent) {
      // Fallback to non-streaming (or if streaming failed/returned empty)
      console.log('[SLACK_EVENTS] Using fallback generation (reason: stream failed or empty)');
      logDebug('Using fallback generation');

      let response: string;
      let prefix: string;

      if (isCode && intent) {
        response = await generateCodeResponse(cleanText, language, intent, history);
        const emoji = getIntentEmoji(intent);
        const label = getIntentLabel(intent);
        const langInfo = language ? ` (${getLanguageDisplayName(language)})` : '';
        prefix = `${emoji} *Genie ${label}${langInfo}:*\n`;
      } else {
        response = await generateGenieResponse(cleanText, history);
        prefix = '🧞 *Genie:*\n';
      }

      await updateThreadHistory(config.teamId, threadTs, { role: 'user', content: cleanText });
      await updateThreadHistory(config.teamId, threadTs, { role: 'model', content: response });

      await sendSlackMessage(
        config.botToken,
        channel,
        `${prefix}${response}`,
        threadTs,
        createStandardFeedbackBlocks(cleanText)
      );
    }

    // Clear loading status
    await clearAssistantStatus(config.botToken, channel, threadTs);

    // Add completion reaction based on type
    const reactionEmoji = isCode ? 'computer' : 'white_check_mark';
    await addReaction(config.botToken, channel, ts, reactionEmoji);
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
 * Handle direct messages with code detection
 */
async function handleDirectMessage(config: SlackConfig, event: any): Promise<void> {
  const { channel, text, ts, thread_ts, user } = event;

  // Use thread_ts if available, otherwise use ts as the thread
  const threadTs = thread_ts || ts;

  // Detect if this is a code-related request
  const isCode = isCodeRelated(text);
  const language = isCode ? detectLanguage(text) : null;
  const intent = isCode ? detectCodeIntent(text) : null;

  console.log('[SLACK_EVENTS] DM analysis:', {
    isCode,
    language,
    intent,
    textLength: text.length,
  });

  // Set loading status with context-aware message
  await setAssistantStatus(
    config.botToken,
    channel,
    threadTs,
    getSmartLoadingMessage(isCode, intent || undefined)
  );

  // Set thread title based on first message
  if (!thread_ts) {
    let title = generateThreadTitle(text);
    // Add code indicator to title if it's a code request
    if (isCode && intent) {
      const emoji = getIntentEmoji(intent);
      title = `${emoji} ${title}`;
    }
    await setThreadTitle(config.botToken, channel, ts, title);
  }

  try {
    const history = await getThreadHistory(config.teamId, threadTs);
    let fullResponse = '';
    let responseSent = false;

    // Try streaming first
    const streamer = createStreamer({
      botToken: config.botToken,
      channel,
      threadTs,
    });

    const started = await streamer.start();

    if (started) {
      // Stream the response based on type
      if (isCode && intent) {
        for await (const chunk of generateCodeResponseStream(text, language, intent, history)) {
          await streamer.append(convertMarkdownToSlack(chunk));
        }
      } else {
        for await (const chunk of generateGenieResponseStream(text, history)) {
          await streamer.append(chunk);
        }
      }
      await streamer.stop();

      fullResponse = streamer.getBuffer();

      // If content was generated, we consider it sent
      if (fullResponse && fullResponse.trim().length > 0) {
        await updateThreadHistory(config.teamId, threadTs, { role: 'user', content: text });
        await updateThreadHistory(config.teamId, threadTs, { role: 'model', content: fullResponse });
        responseSent = true;

        console.log('[SLACK_EVENTS] Streamed DM response:', {
          teamId: config.teamId,
          user,
          isCode,
          language,
          intent,
          inputLength: text.length,
          outputLength: fullResponse.length,
          historyLength: history.length,
        });
      } else {
        console.warn('[SLACK_EVENTS] DM stream produced empty response, falling back to non-streaming');
      }
    }

    if (!responseSent) {
      // Fallback to non-streaming
      console.log('[SLACK_EVENTS] Streaming not available for DM, using fallback');

      let response: string;
      let prefix = '';

      if (isCode && intent) {
        response = await generateCodeResponse(text, language, intent, history);
        const emoji = getIntentEmoji(intent);
        const label = getIntentLabel(intent);
        const langInfo = language ? ` (${getLanguageDisplayName(language)})` : '';
        prefix = `${emoji} *${label}${langInfo}:*\n`;
      } else {
        response = await generateGenieResponse(text, history);
      }

      await updateThreadHistory(config.teamId, threadTs, { role: 'user', content: text });
      await updateThreadHistory(config.teamId, threadTs, { role: 'model', content: response });

      await sendSlackMessage(
        config.botToken,
        channel,
        `${prefix}${response}`,
        threadTs,
        createStandardFeedbackBlocks(text)
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
 * Handle workflow_step_execute event
 * Executes custom workflow steps (Analyze / Generate)
 */
async function handleWorkflowStepExecute(config: SlackConfig, event: any): Promise<void> {
  const { callback_id, workflow_step } = event;
  const { inputs, workflow_step_execute_id } = workflow_step;

  console.log('[SLACK_EVENTS] Executing workflow step:', { callbackId: callback_id, executeId: workflow_step_execute_id });

  try {
    let outputs = {};

    // 1. Analyze Text
    if (callback_id === 'analyze_text_step') {
      const text = inputs.text?.value;
      if (text) {
        const analysis = await generateCodeResponse(
          `Analyze the following text/code and provide a summary:\n\n${text}`,
          null,
          'review'
        );
        outputs = { analysis };
      }
    }

    // 2. Generate Code
    else if (callback_id === 'generate_code_step') {
      const prompt = inputs.prompt?.value;
      if (prompt) {
        const code = await generateCodeResponse(
          `Generate code for the following request:\n\n${prompt}`,
          null,
          'generation'
        );
        outputs = { code };
      }
    }

    // Report success back to Slack
    await fetch(`${SLACK_API_BASE}/workflows.stepCompleted`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.botToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        workflow_step_execute_id: workflow_step_execute_id,
        outputs
      })
    });

  } catch (error) {
    console.error('[SLACK_EVENTS] Error executing workflow step:', error);
    // Report fail
    await fetch(`${SLACK_API_BASE}/workflows.stepFailed`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.botToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        workflow_step_execute_id: workflow_step_execute_id,
        error: { message: 'Failed to execute step' }
      })
    });
  }
}

/**
 * Handle file_shared events
 * Downloads code/text files and analyzes them
 */
async function handleFileShared(config: SlackConfig, event: any): Promise<void> {
  const { file_id, user_id, channel_id } = event;

  console.log('[SLACK_EVENTS] File shared:', { fileId: file_id, userId: user_id, channelId: channel_id });

  try {
    // 1. Get file info
    const fileInfoResponse = await fetch(`${SLACK_API_BASE}/files.info?file=${file_id}`, {
      headers: { 'Authorization': `Bearer ${config.botToken}` }
    });
    const fileInfoData = await fileInfoResponse.json();

    if (!fileInfoData.ok) {
      console.error('[SLACK_EVENTS] Failed to get file info:', fileInfoData.error);
      return;
    }

    const file = fileInfoData.file;

    // Check if it's a text-based file we can process
    // supported: text, python, javascript, etc. (mimetype usually starts with text/ or application/json/javascript)
    // Slack 'filetype' field is useful: python, javascript, text, markdown, json, etc.
    const supportedTypes = ['text', 'python', 'javascript', 'typescript', 'json', 'markdown', 'html', 'css', 'yaml', 'xml', 'shell', 'java', 'c', 'cpp', 'go', 'ruby', 'php'];

    if (!supportedTypes.includes(file.filetype) && !file.mimetype.startsWith('text/')) {
      console.log('[SLACK_EVENTS] Unsupported file type:', file.filetype);
      // Optional: Respond saying we can't read this file yet
      return;
    }

    // 2. Download content
    const contentResponse = await fetch(file.url_private, {
      headers: { 'Authorization': `Bearer ${config.botToken}` }
    });

    if (!contentResponse.ok) {
      console.error('[SLACK_EVENTS] Failed to download file content');
      return;
    }

    const content = await contentResponse.text();

    if (!content) {
      return;
    }

    // 3. Set status
    // Note: We don't have a thread_ts yet usually, unless it was shared in a thread.
    // 'shares' object in file info tells us where it was shared.
    const threadTs = file.shares?.public?.[channel_id]?.[0]?.ts || event.ts;

    await setAssistantStatus(
      config.botToken,
      channel_id,
      threadTs,
      "📄 Reading file..."
    );

    // 4. Analyze with Gemini
    // Construct a prompt context
    const analysisPrompt = `
I have analyzed the uploaded file: \`${file.name}\` (${file.filetype}).

File Content:
\`\`\`${file.filetype}
${content.substring(0, 10000)} ${content.length > 10000 ? '...(truncated)' : ''}
\`\`\`

Please provide a summary and code analysis of this file. Identify purpose, key logic, and any potential issues.
`;

    const response = await generateCodeResponse(analysisPrompt, null, 'review');

    // 5. Reply
    await sendSlackMessage(
      config.botToken,
      channel_id,
      `📄 *File Analysis: ${file.name}*\n\n${response}`,
      threadTs,
      createStandardFeedbackBlocks(analysisPrompt)
    );

    await clearAssistantStatus(config.botToken, channel_id, threadTs);
    await addReaction(config.botToken, channel_id, threadTs, 'eyes');

  } catch (error) {
    console.error('[SLACK_EVENTS] Error handling file share:', error);
    await sendSlackMessage(config.botToken, channel_id, "I tried to read the file but encountered an error.", event.ts);
  }
}

/**
 * Handle app_home_opened event
 */
async function handleAppHomeOpened(config: SlackConfig, event: any): Promise<void> {
  const { user, tab, team_id } = event;

  console.log('[SLACK_EVENTS] App Home opened:', {
    teamId: team_id,
    user,
    tab,
  });

  // Only handle Home tab for now
  if (tab === 'home') {
    await publishAppHome(user, team_id);
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
      logDebug('Received event body:', body);
    } catch (parseError) {
      console.error('[SLACK_EVENTS] Failed to parse JSON:', parseError);
      return new NextResponse('Invalid JSON', { status: 400 });
    }

    // ─────────────────────────────────────────────────────────────────
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

    // ─────────────────────────────────────────────────────────────────
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
    // ─────────────────────────────────────────────────────────────────
    // Verify Slack Signature
    // ─────────────────────────────────────────────────────────────────
    const timestamp = req.headers.get('x-slack-request-timestamp') || '';
    const signature = req.headers.get('x-slack-signature') || '';

    // Enforce verification if we have the secret, regardless of environment
    // This allows testing dev environments securely if they are exposed
    if (process.env.SLACK_SIGNING_SECRET) {
      if (!verifySlackSignature(rawBody, timestamp, signature)) {
        console.error('[SLACK_EVENTS] Invalid Slack signature');
        return new NextResponse('Unauthorized', { status: 401 });
      }
    } else if (process.env.NODE_ENV === 'production') {
      // Critical: Production MUST have the secret
      console.error('[SLACK_EVENTS] SLACK_SIGNING_SECRET missing in production');
      return new NextResponse('Server Configuration Error', { status: 500 });
    } else {
      console.warn('[SLACK_EVENTS] Skipping signature verification (no secret set in non-prod)');
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
            // Assistant Thread Events (Agents & AI Apps)
            // ─────────────────────────────────────────────────────────
            case 'assistant_thread_started':
              await handleAssistantThreadStarted(config, event);
              break;

            case 'assistant_thread_context_changed':
              await handleAssistantThreadContextChanged(config, event);
              break;

            // ─────────────────────────────────────────────────────────
            // Message Events (Enhanced with code detection)
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
            case 'workflow_step_execute':
              await handleWorkflowStepExecute(config, event);
              break;

            case 'file_shared':
              await handleFileShared(config, event);
              break;

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
      waitUntil(responsePromise.catch((err) =>
        console.error('[SLACK_EVENTS] Event processing error:', err)
      ));

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
    version: '3.2.0', // Updated version
    features: [
      'multi-tenant',
      'text-streaming',
      'loading-states',
      'suggested-prompts',
      'thread-titles',
      'feedback-blocks',
      'code-detection',
      'language-detection',
      'intent-detection',
      'code-specific-prompts',
      'thread-level-memory', // Added feature
      'app-home-dashboard', // Added feature
    ],
    timestamp: new Date().toISOString(),
  });
}
