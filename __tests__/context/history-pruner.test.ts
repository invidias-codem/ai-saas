import {
  pruneHistory,
  groupIntoBeats,
  truncateMessageText,
  getMessageText,
  ChatMessage,
  Beat
} from '../../lib/context/HistoryPruner';

describe('HistoryPruner', () => {
  // 1. Test getMessageText
  describe('getMessageText', () => {
    test('extracts text from simple text property', () => {
      const msg: ChatMessage = { role: 'user', text: 'Hello world' };
      expect(getMessageText(msg)).toBe('Hello world');
    });

    test('extracts text from parts array of strings', () => {
      const msg: ChatMessage = { role: 'user', parts: ['Hello ', 'world'] };
      expect(getMessageText(msg)).toBe('Hello world');
    });

    test('extracts text from parts array of objects', () => {
      const msg: ChatMessage = { role: 'user', parts: [{ text: 'Hello ' }, { text: 'world' }] };
      expect(getMessageText(msg)).toBe('Hello world');
    });

    test('returns empty string if no text or parts', () => {
      const msg: ChatMessage = { role: 'user' };
      expect(getMessageText(msg)).toBe('');
    });
  });

  // 2. Test truncateMessageText (middle truncation)
  describe('truncateMessageText', () => {
    test('returns original text if under limit', () => {
      const text = 'short text';
      expect(truncateMessageText(text, 100)).toBe(text);
    });

    test('performs middle truncation correctly when exceeding limit', () => {
      const text = 'A'.repeat(100) + 'B'.repeat(100);
      const truncated = truncateMessageText(text, 160);
      expect(truncated).toContain('[TRUNCATED');
      expect(truncated.startsWith('AAAA')).toBe(true);
      expect(truncated.endsWith('BBBB')).toBe(true);
      expect(truncated.length).toBeLessThan(text.length);
    });

    test('handles small maxChars gracefully', () => {
      const text = 'abcdefghijkl';
      const truncated = truncateMessageText(text, 2);
      expect(truncated).toBe(text); // Fallback to original text if keepChars <= 0
    });
  });

  // 3. Test groupIntoBeats
  describe('groupIntoBeats', () => {
    const mockEstimateToken = (text: string) => Math.ceil(text.length / 4);

    test('returns empty array for empty history', () => {
      expect(groupIntoBeats([], mockEstimateToken)).toEqual([]);
    });

    test('groups leading user messages as initial_query', () => {
      const history: ChatMessage[] = [
        { role: 'user', text: 'First user message' },
        { role: 'user', text: 'Second user message' },
      ];
      const beats = groupIntoBeats(history, mockEstimateToken);
      expect(beats).toHaveLength(1);
      expect(beats[0].type).toBe('initial_query');
      expect(beats[0].messages).toHaveLength(2);
      expect(beats[0].estimatedTokens).toBe(
        mockEstimateToken('First user message') + mockEstimateToken('Second user message')
      );
    });

    test('identifies tool transaction beat correctly', () => {
      const history: ChatMessage[] = [
        { role: 'user', text: 'Starting prompt' },
        { role: 'assistant', text: 'Let me run a tool <tool_call>{"tool": "ls"}</tool_call>' },
        { role: 'user', text: 'Tool result: folder1, folder2' },
      ];
      const beats = groupIntoBeats(history, mockEstimateToken);
      expect(beats).toHaveLength(2);
      expect(beats[0].type).toBe('initial_query');
      expect(beats[1].type).toBe('tool_transaction');
      expect(beats[1].messages).toHaveLength(2);
      expect(beats[1].messages[0].role).toBe('assistant');
      expect(beats[1].messages[1].role).toBe('user');
    });

    test('groups orphan assistant or general user messages as general_chat', () => {
      const history: ChatMessage[] = [
        { role: 'assistant', text: 'Hi, how can I help?' },
        { role: 'user', text: 'Tell me a joke' },
      ];
      const beats = groupIntoBeats(history, mockEstimateToken);
      expect(beats).toHaveLength(2);
      expect(beats[0].type).toBe('general_chat'); // first role isn't user/client, so it's general chat
      expect(beats[1].type).toBe('general_chat');
    });
  });

  // 4. Test pruneHistory
  describe('pruneHistory', () => {
    const mockEstimateToken = (text: string) => Math.ceil(text.length / 4);

    test('returns empty array if empty history', () => {
      expect(pruneHistory([], 'current query')).toEqual([]);
    });

    test('returns unmodified history if within token budget', () => {
      const history: ChatMessage[] = [
        { role: 'user', text: 'Hi' },
        { role: 'assistant', text: 'Hello' },
      ];
      const pruned = pruneHistory(history, 'How are you?', {
        maxHistoryTokens: 1000,
        estimateTokenFn: mockEstimateToken,
      });
      expect(pruned).toEqual(history);
    });

    test('pre-truncates extremely large individual messages', () => {
      const longMessage = 'A'.repeat(1000);
      const history: ChatMessage[] = [
        { role: 'user', text: 'Hi' },
        { role: 'assistant', text: longMessage },
      ];
      const pruned = pruneHistory(history, 'Short query', {
        maxHistoryTokens: 1000,
        estimateTokenFn: mockEstimateToken,
        maxMessageLengthChars: 200, // force truncation
      });
      expect(pruned).toHaveLength(2);
      expect(pruned[1].text).toContain('[TRUNCATED');
    });

    test('prunes intermediate beats oldest-first, maintaining beat 0 and the latest beat', () => {
      const history: ChatMessage[] = [
        { role: 'user', text: 'Initial Query' }, // Beat 0: initial_query
        { role: 'assistant', text: 'Oldest middle message' }, // Beat 1: general_chat
        { role: 'user', text: 'Middle message 2' }, // Beat 2: general_chat
        { role: 'assistant', text: 'Middle message 3' }, // Beat 3: general_chat
        { role: 'user', text: 'Latest turn' }, // Beat 4: latest beat
      ];

      const pruned = pruneHistory(history, 'Current', {
        maxHistoryTokens: 10,
        estimateTokenFn: mockEstimateToken,
      });

      expect(pruned).toHaveLength(2);
      expect(pruned[0].text).toBe('Initial Query');
      expect(pruned[1].text).toBe('Latest turn');
    });

    test('preserves tool transactions atomically during pruning', () => {
      const history: ChatMessage[] = [
        { role: 'user', text: 'Initial Query' }, // Beat 0
        { role: 'assistant', text: 'Call tool 1 <tool_call>{}</tool_call>' }, // Beat 1 part A
        { role: 'user', text: 'Tool 1 result' }, // Beat 1 part B
        { role: 'assistant', text: 'Call tool 2 <tool_call>{}</tool_call>' }, // Beat 2 part A
        { role: 'user', text: 'Tool 2 result' }, // Beat 2 part B
        { role: 'user', text: 'Latest turn' }, // Beat 3
      ];

      const pruned = pruneHistory(history, 'Current', {
        maxHistoryTokens: 25,
        estimateTokenFn: mockEstimateToken,
      });

      const hasTool1Call = pruned.some(m => m.text?.includes('Call tool 1'));
      const hasTool1Result = pruned.some(m => m.text?.includes('Tool 1 result'));
      expect(hasTool1Call).toBe(hasTool1Result); // Atomicity check

      const hasTool2Call = pruned.some(m => m.text?.includes('Call tool 2'));
      const hasTool2Result = pruned.some(m => m.text?.includes('Tool 2 result'));
      expect(hasTool2Call).toBe(hasTool2Result); // Atomicity check
    });
  });
});
