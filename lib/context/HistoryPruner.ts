import { estimateTokenCount } from '@/lib/ragMemory';

export interface ChatMessage {
  role: string;
  text?: string;
  parts?: any[];
  [key: string]: any;
}

export interface Beat {
  type: 'initial_query' | 'tool_transaction' | 'general_chat';
  messages: ChatMessage[];
  estimatedTokens: number;
}

export interface HistoryPrunerOptions {
  maxHistoryTokens?: number;
  estimateTokenFn?: (text: string) => number;
  maxMessageLengthChars?: number; // Optional limit to trigger middle-truncation for oversized individual messages
}

/**
 * Extracts string text from a ChatMessage's fields (supporting direct text or parts arrays).
 */
export function getMessageText(msg: ChatMessage): string {
  if (msg.text) return msg.text;
  if (msg.parts && Array.isArray(msg.parts)) {
    return msg.parts
      .map((p) => (typeof p === 'string' ? p : p.text || ''))
      .join('');
  }
  return '';
}

/**
 * Returns a middle-truncated version of the text if it exceeds maxChars.
 * Keeps the beginning and the end of the text to preserve context (e.g., imports/headers and final outcomes/stack traces).
 */
export function truncateMessageText(text: string, maxChars: number = 16000): string {
  if (!text || text.length <= maxChars) return text;

  const keepChars = Math.floor((maxChars - 150) / 2);
  if (keepChars <= 0) return text; // Fallback if maxChars is extremely small

  const start = text.slice(0, keepChars);
  const end = text.slice(text.length - keepChars);
  const truncatedCount = text.length - maxChars;

  return `${start}\n\n... [TRUNCATED ${truncatedCount} CHARACTERS FOR CONTEXT WINDOW BUDGET] ...\n\n${end}`;
}

/**
 * Group history into logical conversation beats.
 * - Initial Query: The first sequence of user messages.
 * - Tool Transaction: Assistant message containing a tool call paired with the subsequent user message (tool result).
 * - General Chat: Standalone assistant or user messages.
 */
export function groupIntoBeats(
  history: ChatMessage[],
  estimateTokenFn: (text: string) => number
): Beat[] {
  const beats: Beat[] = [];
  if (history.length === 0) return beats;

  let i = 0;

  // 1. Group leading user messages as 'initial_query'
  const initialQueryMessages: ChatMessage[] = [];
  while (i < history.length && (history[i].role === 'user' || history[i].role === 'client')) {
    initialQueryMessages.push(history[i]);
    i++;
  }

  if (initialQueryMessages.length > 0) {
    const estimatedTokens = initialQueryMessages.reduce(
      (sum, msg) => sum + estimateTokenFn(getMessageText(msg)),
      0
    );
    beats.push({
      type: 'initial_query',
      messages: initialQueryMessages,
      estimatedTokens,
    });
  }

  // 2. Scan remaining messages
  while (i < history.length) {
    const current = history[i];
    const isAssistant =
      current.role === 'assistant' || current.role === 'model' || current.role === 'bot';

    if (isAssistant) {
      const text = getMessageText(current);
      const hasToolCall = text.includes('<tool_call>') || text.includes('</tool_call>');

      if (hasToolCall && i + 1 < history.length) {
        const next = history[i + 1];
        const isNextUser = next.role === 'user' || next.role === 'client';

        if (isNextUser) {
          // Coherent transaction beat: Assistant tool_call + User tool_result
          const msgs = [current, next];
          const estimatedTokens = msgs.reduce(
            (sum, msg) => sum + estimateTokenFn(getMessageText(msg)),
            0
          );
          beats.push({
            type: 'tool_transaction',
            messages: msgs,
            estimatedTokens,
          });
          i += 2;
          continue;
        }
      }

      // Standalone assistant message or orphaned tool call
      const msgs = [current];
      const estimatedTokens = msgs.reduce(
        (sum, msg) => sum + estimateTokenFn(getMessageText(msg)),
        0
      );
      beats.push({
        type: 'general_chat',
        messages: msgs,
        estimatedTokens,
      });
      i += 1;
    } else {
      // Standalone user message
      const msgs = [current];
      const estimatedTokens = msgs.reduce(
        (sum, msg) => sum + estimateTokenFn(getMessageText(msg)),
        0
      );
      beats.push({
        type: 'general_chat',
        messages: msgs,
        estimatedTokens,
      });
      i += 1;
    }
  }

  return beats;
}

/**
 * Pure function that prunes message history to fit within maxHistoryTokens.
 * Guarantees that:
 * 1. Initial query beat (Beat 0) is preserved.
 * 2. Latest active conversational turn (the last beat) is preserved.
 * 3. Tool call / Tool result pairs are pruned together as atomic beats, oldest first.
 * 4. Pre-truncates extremely large individual messages to keep the window highly optimized.
 */
export function pruneHistory(
  history: ChatMessage[],
  currentText: string,
  options?: HistoryPrunerOptions
): ChatMessage[] {
  if (!history || history.length === 0) return [];

  const maxHistoryTokens = options?.maxHistoryTokens ?? 8000;
  const estimateTokenFn = options?.estimateTokenFn ?? estimateTokenCount;
  const maxMessageLengthChars = options?.maxMessageLengthChars ?? 16000; // ~4000 tokens default trigger

  // Step 1: Pre-process and apply middle-truncation to individual oversized messages
  const preProcessedHistory = history.map((msg) => {
    const rawText = getMessageText(msg);
    if (rawText.length > maxMessageLengthChars) {
      const truncatedText = truncateMessageText(rawText, maxMessageLengthChars);
      const newMsg = { ...msg };
      if (newMsg.text !== undefined) {
        newMsg.text = truncatedText;
      } else if (newMsg.parts && Array.isArray(newMsg.parts)) {
        newMsg.parts = newMsg.parts.map((p, idx) =>
          idx === 0
            ? typeof p === 'string'
              ? truncatedText
              : { ...p, text: truncatedText }
            : p
        );
      } else {
        newMsg.text = truncatedText; // Default fallback
      }
      return newMsg;
    }
    return msg;
  });

  // Calculate current active query tokens
  const currentTextTokens = estimateTokenFn(currentText);

  // Step 2: Group into beats
  const beats = groupIntoBeats(preProcessedHistory, estimateTokenFn);
  if (beats.length === 0) return [];

  let totalHistoryTokens = beats.reduce((sum, b) => sum + b.estimatedTokens, 0);

  // If total tokens are within budget, return the preprocessed history
  if (totalHistoryTokens + currentTextTokens <= maxHistoryTokens) {
    return preProcessedHistory;
  }

  // Step 3: Atomic oldest-first pruning
  const initialQueryIndex = 0;
  const latestBeatIndex = beats.length - 1;

  // Track pruned indices
  const prunedIndices = new Set<number>();

  // Intermediate beats are candidates for pruning, starting from oldest (index 1) to newest
  for (let idx = 1; idx < latestBeatIndex; idx++) {
    if (totalHistoryTokens + currentTextTokens <= maxHistoryTokens) {
      break;
    }
    prunedIndices.add(idx);
    totalHistoryTokens -= beats[idx].estimatedTokens;
  }

  // Step 4: Reassemble final history from remaining beats
  const remainingMessages: ChatMessage[] = [];
  for (let idx = 0; idx < beats.length; idx++) {
    if (!prunedIndices.has(idx)) {
      remainingMessages.push(...beats[idx].messages);
    }
  }

  return remainingMessages;
}
