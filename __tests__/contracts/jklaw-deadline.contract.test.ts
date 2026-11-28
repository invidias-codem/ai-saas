jest.mock('@/lib/env', () => ({ env: { JKLAW_API_KEY: 'test-jklaw' } }));
jest.mock('@/lib/llm/conversationEngine', () => ({
  generateConversationReply: jest.fn(),
  ConversationRequestSchema: { safeParse: (data: unknown) => ({ success: true, data }) },
}));
jest.mock('@/lib/memory/vectorStore', () => ({ searchMemories: jest.fn(), storeMemory: jest.fn(), deleteMemory: jest.fn() }));
jest.mock('@/lib/memory/graphStore', () => ({ addNode: jest.fn() }));
jest.mock('@/lib/security/auditLog', () => ({ audit: jest.fn() }));

import { POST } from '@/app/api/internal/jklaw/route';
import { generateConversationReply } from '@/lib/llm/conversationEngine';
import { searchMemories } from '@/lib/memory/vectorStore';
import { PROVIDER_ERROR_EVENT_PREFIX } from '@/lib/media/envelope';

const request = (stream = false, signal?: AbortSignal) => new Request('https://example.test/api/internal/jklaw', {
  method: 'POST', headers: { 'x-jklaw-key': 'test-jklaw', 'content-type': 'application/json' },
  body: JSON.stringify({ action: 'chat', prompt: 'question', userId: 'user_test', stream }), signal,
});

describe('JKlaw bounded chat', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    (searchMemories as jest.Mock).mockResolvedValue([]);
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

  test('stalled generation returns a controlled 504 before the platform limit', async () => {
    (generateConversationReply as jest.Mock).mockReturnValue(new Promise(() => {}));
    const pending = POST(request());
    await jest.advanceTimersByTimeAsync(240_001);
    expect((await pending).status).toBe(504);
    const options = (generateConversationReply as jest.Mock).mock.calls[0][1];
    expect(options.signal.aborted).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  });

  test('slow optional context falls back and does not trigger duplicate retrieval', async () => {
    (searchMemories as jest.Mock).mockReturnValue(new Promise(() => {}));
    (generateConversationReply as jest.Mock).mockResolvedValue({ stream: new ReadableStream({
      start(c) { c.enqueue(new TextEncoder().encode('answer')); c.close(); },
    }) });
    const pending = POST(request());
    await jest.advanceTimersByTimeAsync(5_001);
    const response = await pending;
    expect(response.status).toBe(200);
    expect((await response.json()).response).toBe('answer');
    expect((generateConversationReply as jest.Mock).mock.calls[0][1].disableExternalContext).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  });

  test('disconnect prevents later generation after a stalled context lookup', async () => {
    (searchMemories as jest.Mock).mockReturnValue(new Promise(() => {}));
    const controller = new AbortController();
    const pending = POST(request(false, controller.signal));
    await jest.advanceTimersByTimeAsync(1);
    controller.abort();
    expect((await pending).status).toBe(499);
    expect(generateConversationReply).not.toHaveBeenCalled();
  });

  test('stalled nonstream response body is cancelled on the deadline', async () => {
    const cancel = jest.fn();
    (generateConversationReply as jest.Mock).mockResolvedValue({ stream: new ReadableStream({ cancel }) });
    const pending = POST(request());
    await jest.advanceTimersByTimeAsync(240_001);
    expect((await pending).status).toBe(504);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  test('streaming timeout emits a failure marker and closes without a broken HTTP body', async () => {
    const cancel = jest.fn();
    (generateConversationReply as jest.Mock).mockResolvedValue({ stream: new ReadableStream({ cancel }) });
    const response = await POST(request(true));
    const text = response.text();
    await jest.advanceTimersByTimeAsync(240_001);
    expect(await text).toContain(PROVIDER_ERROR_EVENT_PREFIX);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  test('response consumer cancellation aborts inference even without a request disconnect event', async () => {
    const cancel = jest.fn();
    (generateConversationReply as jest.Mock).mockResolvedValue({ stream: new ReadableStream({ cancel }) });
    const response = await POST(request(true));
    await response.body!.cancel('reader closed');
    expect(cancel).toHaveBeenCalledTimes(1);
    expect((generateConversationReply as jest.Mock).mock.calls[0][1].signal.aborted).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  });
});
