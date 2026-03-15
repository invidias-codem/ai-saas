/**
 * Slack Assistant Helpers
 * 
 * Utilities for Slack's Agents & AI Apps features:
 * - Loading states (assistant.threads.setStatus)
 * - Suggested prompts (assistant.threads.setSuggestedPrompts)
 * - Thread titles (assistant.threads.setTitle)
 * - Text streaming (chat.startStream, chat.appendStream, chat.stopStream)
 */

import { GoogleGenerativeAI } from "@google/generative-ai";

const SLACK_API_BASE = 'https://slack.com/api';

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || '');
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

/**
 * Suggested prompt configuration
 */
export interface SuggestedPrompt {
  title: string;
  message: string;
}

/**
 * Streaming configuration
 */
export interface StreamConfig {
  botToken: string;
  channel: string;
  threadTs: string;
  teamId?: string;
  userId?: string;
}

/**
 * Stream state for managing active streams
 */
export interface StreamState {
  messageTs: string;
  channel: string;
  threadTs: string;
}

// ─────────────────────────────────────────────────────────────────
// Loading States
// ─────────────────────────────────────────────────────────────────

/**
 * Check if the text implies a need for channel context
 */
export function shouldFetchContext(text: string): boolean {
  const contextKeywords = ["context", "summary", "summarize", "catch up", "happened", "previous", "channel", "everyone", "vibe"];
  return contextKeywords.some(keyword => text.toLowerCase().includes(keyword));
}

/**
 * Fetch recent history from a channel for context (excluding bot's own messages)
 * 
 * @param botToken - Bot token for the workspace
 * @param channelId - Channel ID to fetch history from
 * @param limit - Number of messages to fetch (default: 10)
 */
export async function getChannelHistory(
  botToken: string,
  channelId: string,
  limit: number = 20
): Promise<{ ok: boolean; messages?: any[]; error?: string }> {
  try {
    const url = `${SLACK_API_BASE}/conversations.history?channel=${channelId}&limit=${limit}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (!data.ok) {
      console.error('[ASSISTANT] Failed to fetch channel history:', data.error);
      return { ok: false, error: data.error };
    }

    // Filter and sanitize messages
    // We want to capture the "vibe" but ignore system messages and bot clutter
    const messages = (data.messages || [])
      .filter((msg: any) =>
        msg.type === 'message' &&
        !msg.subtype && // Ignore subtype messages (joins, leaves, etc.)
        msg.text && // Must have text
        msg.text.length > 0
      )
      .map((msg: any) => ({
        user: msg.user,
        text: msg.text,
        ts: msg.ts,
        // If it's a bot, mark it (optional, useful for context)
        is_bot: !!msg.bot_id
      }))
      .reverse(); // Oldest first for context window

    return { ok: true, messages };
  } catch (error: any) {
    console.error('[ASSISTANT] Error fetching channel history:', error.message);
    return { ok: false, error: error.message };
  }
}

// ─────────────────────────────────────────────────────────────────
// Loading States
// ─────────────────────��───────────────────────────────────────────

/**
 * Set the assistant's loading status
 * Shows a status message while processing
 * 
 * @param botToken - Bot token for the workspace
 * @param channelId - Channel ID where the thread is
 * @param threadTs - Thread timestamp
 * @param status - Status message to display (empty string to clear)
 */
export async function setAssistantStatus(
  botToken: string,
  channelId: string,
  threadTs: string,
  status: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(`${SLACK_API_BASE}/assistant.threads.setStatus`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel_id: channelId,
        thread_ts: threadTs,
        status: status,
      }),
    });

    const data = await response.json();

    if (!data.ok) {
      // Ignore channel_not_found as it happens for DMs (which are not assistant threads)
      if (data.error === 'channel_not_found') {
        return { ok: false, error: 'channel_not_found' };
      }
      console.error('[ASSISTANT] Failed to set status:', data.error);
    }

    return data;
  } catch (error: any) {
    console.error('[ASSISTANT] Error setting status:', error.message);
    return { ok: false, error: error.message };
  }
}

/**
 * Clear the assistant's loading status
 */
export async function clearAssistantStatus(
  botToken: string,
  channelId: string,
  threadTs: string
): Promise<{ ok: boolean; error?: string }> {
  return setAssistantStatus(botToken, channelId, threadTs, '');
}

/**
 * Cycle through loading messages
 * Creates a more engaging loading experience
 */
export async function cycleLoadingMessages(
  botToken: string,
  channelId: string,
  threadTs: string,
  messages: string[],
  intervalMs: number = 2000
): Promise<() => void> {
  let index = 0;
  let stopped = false;

  const cycle = async () => {
    if (stopped) return;

    await setAssistantStatus(botToken, channelId, threadTs, messages[index]);
    index = (index + 1) % messages.length;

    if (!stopped) {
      setTimeout(cycle, intervalMs);
    }
  };

  // Start cycling
  cycle();

  // Return stop function
  return () => {
    stopped = true;
    clearAssistantStatus(botToken, channelId, threadTs);
  };
}

// ─────────────────────────────────────────────────────────────────
// Suggested Prompts
// ─────────────────────────────────────────────��───────────────────

/**
 * Set suggested prompts for the user
 * 
 * @param botToken - Bot token for the workspace
 * @param channelId - Channel ID where the thread is
 * @param threadTs - Thread timestamp
 * @param title - Title above the prompts
 * @param prompts - Array of suggested prompts (max 4)
 */
export async function setSuggestedPrompts(
  botToken: string,
  channelId: string,
  threadTs: string,
  title: string,
  prompts: SuggestedPrompt[]
): Promise<{ ok: boolean; error?: string }> {
  try {
    // Limit to 4 prompts as per Slack's limit
    const limitedPrompts = prompts.slice(0, 4);

    const response = await fetch(`${SLACK_API_BASE}/assistant.threads.setSuggestedPrompts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel_id: channelId,
        thread_ts: threadTs,
        title: title,
        prompts: limitedPrompts,
      }),
    });

    const data = await response.json();

    if (!data.ok) {
      // Ignore channel_not_found
      if (data.error === 'channel_not_found') {
        return { ok: false, error: 'channel_not_found' };
      }
      console.error('[ASSISTANT] Failed to set suggested prompts:', data.error);
    }

    return data;
  } catch (error: any) {
    console.error('[ASSISTANT] Error setting suggested prompts:', error.message);
    return { ok: false, error: error.message };
  }
}

/**
 * Default suggested prompts for Genie
 */
export const DEFAULT_GENIE_PROMPTS: SuggestedPrompt[] = [
  {
    title: '📄 Analyze a document',
    message: 'Please analyze the document I\'m about to share and provide a summary with key insights.',
  },
  {
    title: '💻 Help with code',
    message: 'I need help writing or debugging code. Can you assist me?',
  },
  {
    title: '📝 Summarize this channel',
    message: 'Can you summarize the recent activity and key discussions in this channel?',
  },
  {
    title: '🎯 Create action items',
    message: 'Help me create action items and next steps from our recent discussion.',
  },
];

/**
 * Context-aware prompts based on channel context
 */
export function getContextAwarePrompts(hasChannelContext: boolean): SuggestedPrompt[] {
  if (hasChannelContext) {
    return [
      {
        title: '📊 Summarize this channel',
        message: 'Can you summarize the recent activity in this channel?',
      },
      {
        title: '🎯 Extract action items',
        message: 'What are the key action items from recent discussions in this channel?',
      },
      {
        title: '❓ Answer questions',
        message: 'I have a question about something discussed in this channel.',
      },
      {
        title: '📝 Draft a message',
        message: 'Help me draft a message for this channel.',
      },
    ];
  }

  return DEFAULT_GENIE_PROMPTS;
}

// ─────────────────────────────────────────────────────────────────
// Thread Titles
// ─────────────────────────────────────────────────────────────────

/**
 * Set the title of an assistant thread
 * 
 * @param botToken - Bot token for the workspace
 * @param channelId - Channel ID where the thread is
 * @param threadTs - Thread timestamp
 * @param title - Title for the thread
 */
export async function setThreadTitle(
  botToken: string,
  channelId: string,
  threadTs: string,
  title: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(`${SLACK_API_BASE}/assistant.threads.setTitle`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel_id: channelId,
        thread_ts: threadTs,
        title: title.substring(0, 255), // Max 255 characters
      }),
    });

    const data = await response.json();

    if (!data.ok) {
      // Ignore channel_not_found
      if (data.error === 'channel_not_found') {
        return { ok: false, error: 'channel_not_found' };
      }
      console.error('[ASSISTANT] Failed to set thread title:', data.error);
    }

    return data;
  } catch (error: any) {
    console.error('[ASSISTANT] Error setting thread title:', error.message);
    return { ok: false, error: error.message };
  }
}

/**
 * Generate a thread title from the user's message
 */
export function generateThreadTitle(userMessage: string): string {
  // Take first 50 characters or first sentence
  const firstSentence = userMessage.split(/[.!?]/)[0];
  const title = firstSentence.length > 50
    ? firstSentence.substring(0, 47) + '...'
    : firstSentence;

  return title.trim() || 'New conversation';
}

// ─────────────────────────────────────────────────────────────────
// Text Streaming
// ─────────────────────────────────────────────────────────────────

export async function startStream(
  config: StreamConfig,
  initialText: string = ''
): Promise<{ ok: boolean; state?: StreamState; error?: string }> {
  try {
    const payload: Record<string, any> = {
      channel: config.channel,
      text: initialText || '...', // Initial placeholder
      mrkdwn: true,
    };

    if (config.threadTs) {
      payload.thread_ts = config.threadTs;
    }

    // Use chat.postMessage to start the "stream" (create the message container)
    const response = await fetch(`${SLACK_API_BASE}/chat.postMessage`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!data.ok) {
      if (data.error === 'channel_not_found') {
        console.warn(`[STREAM] Failed to start stream: ${data.error} (Bot may not be in channel)`);
      } else {
        console.error('[STREAM] Failed to start stream (postMessage):', data.error);
      }
      return { ok: false, error: data.error };
    }

    return {
      ok: true,
      state: {
        messageTs: data.ts,
        channel: config.channel,
        threadTs: config.threadTs,
      },
    };
  } catch (error: any) {
    console.error('[STREAM] Error starting stream:', error.message);
    return { ok: false, error: error.message };
  }
}

/**
 * Append text to an active stream
 * Implemented via chat.update
 */
export async function appendStream(
  botToken: string,
  state: StreamState,
  text: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    // Note: Slack checks for rate limits (~1 update per second recommended).
    // In a high-frequency stream, this might get ratelimited.
    // Ideally we should debounce updates in the streamer wrapper.
    const response = await fetch(`${SLACK_API_BASE}/chat.update`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: state.channel,
        ts: state.messageTs,
        text: text, // Update the full text
        mrkdwn: true,
      }),
    });

    const data = await response.json();

    if (!data.ok) {
      // Ignore some errors like 'ratelimited' to avoid crashing the stream flow
      if (data.error !== 'ratelimited') {
        console.error('[STREAM] Failed to append stream (update):', data.error);
      }
    }

    return data;
  } catch (error: any) {
    console.error('[STREAM] Error appending stream:', error.message);
    return { ok: false, error: error.message };
  }
}

/**
 * Stop an active stream
 * Final update to ensure text is correct
 */
export async function stopStream(
  botToken: string,
  state: StreamState,
  finalText: string = ''
): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(`${SLACK_API_BASE}/chat.update`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: state.channel,
        ts: state.messageTs,
        text: finalText,
        mrkdwn: true,
      }),
    });

    const data = await response.json();

    if (!data.ok) {
      console.error('[STREAM] Failed to stop stream (final update):', data.error);
    }

    return data;
  } catch (error: any) {
    console.error('[STREAM] Error stopping stream:', error.message);
    return { ok: false, error: error.message };
  }
}

/**
 * Create a streamer utility for easier streaming
 * Similar to Bolt's chat_stream utility
 */
export function createStreamer(config: StreamConfig) {
  let state: StreamState | null = null;
  let buffer = '';

  return {
    /**
     * Start the stream
     */
    async start(initialText: string = ''): Promise<boolean> {
      const result = await startStream(config, initialText);
      if (result.ok && result.state) {
        state = result.state;
        return true;
      }
      return false;
    },

    /**
     * Append text to the stream
     */
    async append(text: string): Promise<boolean> {
      if (!state) {
        console.error('[STREAMER] Stream not started');
        return false;
      }

      buffer += text;
      // FIX: Send the FULL buffer, not just the chunk, because chat.update replaces content
      const result = await appendStream(config.botToken, state, buffer);
      return result.ok;
    },

    /**
     * Stop the stream
     */
    async stop(finalText: string = ''): Promise<boolean> {
      if (!state) {
        console.error('[STREAMER] Stream not started');
        return false;
      }

      if (finalText) {
        buffer += finalText;
      }

      // FIX: Ensure interactions/buttons are added if needed, or just finalize text
      // We pass the full buffer as the final text
      const result = await stopStream(config.botToken, state, buffer);
      state = null;
      return result.ok;
    },

    /**
     * Get the full buffered text
     */
    getBuffer(): string {
      return buffer;
    },

    /**
     * Check if stream is active
     */
    isActive(): boolean {
      return state !== null;
    },
  };
}

// ─────────────────────────────────────────────────────────────────
// Feedback Blocks
// ─────────────────────────────────────────────────────────────────

/**
 * Create feedback blocks for AI responses
 * Includes thumbs up/down and regenerate button
 */
export function createFeedbackBlocks(
  responseId: string,
  originalPrompt?: string
): any[] {
  return [
    {
      type: 'context_actions',
      elements: [
        {
          type: 'feedback_buttons',
          action_id: 'genie_feedback',
          positive_button: {
            text: { type: 'plain_text', text: '👍' },
            accessibility_label: 'This response was helpful',
            value: JSON.stringify({
              type: 'positive',
              responseId,
              prompt: originalPrompt?.substring(0, 200),
            }),
          },
          negative_button: {
            text: { type: 'plain_text', text: '👎' },
            accessibility_label: 'This response was not helpful',
            value: JSON.stringify({
              type: 'negative',
              responseId,
              prompt: originalPrompt?.substring(0, 200),
            }),
          },
        },
        {
          type: 'icon_button',
          icon: 'refresh',
          text: { type: 'plain_text', text: 'Regenerate' },
          action_id: 'genie_regenerate',
          value: JSON.stringify({
            responseId,
            prompt: originalPrompt?.substring(0, 500),
          }),
        },
      ],
    },
  ];
}

/**
 * Create a response with feedback blocks
 */
export function createResponseWithFeedback(
  responseText: string,
  responseId: string,
  originalPrompt?: string
): any[] {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: responseText,
      },
    },
    ...createFeedbackBlocks(responseId, originalPrompt),
  ];
}

// ─────────────────────────────────────────────────────────────────
// Loading Message Presets
// ─────────────────────────────────────────────────────────────────

export const LOADING_MESSAGES = {
  thinking: [
    'Thinking...',
    'Processing your request...',
    'Analyzing...',
    'Working on it...',
  ],
  creative: [
    'Consulting the digital oracle...',
    'Summoning knowledge from the cloud...',
    'Brewing up a response...',
    'Connecting the dots...',
  ],
  technical: [
    'Analyzing your request...',
    'Processing data...',
    'Computing response...',
    'Generating output...',
  ],
  friendly: [
    'Let me think about that...',
    'Great question! Working on it...',
    'Hmm, let me see...',
    'One moment please...',
  ],
};

/**
 * Get a random loading message from a category
 */
export function getRandomLoadingMessage(
  category: keyof typeof LOADING_MESSAGES = 'thinking'
): string {
  const messages = LOADING_MESSAGES[category];
  return messages[Math.floor(Math.random() * messages.length)];
}

/**
 * Get the Welcome Message Blocks with interactive buttons
 */
export function getWelcomeMessageBlocks(userId?: string): any[] {
  const greeting = userId ? `Hi <@${userId}>!` : "Hi!";

  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `🧞 *${greeting} I'm Genie, your AI assistant.*`,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: "I can help you with understanding code, writing new features, debugging, and much more. I also remember our conversations to provide better context.",
      },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '❓ Ask a Question',
            emoji: true,
          },
          action_id: 'onboarding_ask_question',
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '📊 See My Stats',
            emoji: true,
          },
          action_id: 'onboarding_see_stats',
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '🏠 Visit App Home',
            emoji: true,
          },
          action_id: 'onboarding_app_home',
        },
      ],
    },
  ];
}

/**
 * Generate AI response for code or analysis
 */
export async function generateCodeResponse(
  prompt: string,
  context: string | null = null,
  type: 'review' | 'generation' = 'review'
): Promise<string> {
  try {
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (error) {
    console.error('[ASSISTANT] Error generating AI response:', error);
    return "I apologize, but I encountered an error processing your code request. Please try again.";
  }
}
