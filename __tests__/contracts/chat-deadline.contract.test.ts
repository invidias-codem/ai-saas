jest.mock('next/server', () => ({ NextResponse: class extends Response {
  static json(data: unknown, init?: ResponseInit) { return new Response(JSON.stringify(data), init); }
} }));
jest.mock('@clerk/nextjs/server', () => ({ currentUser: jest.fn().mockResolvedValue({}) }));
jest.mock('@/lib/llm/conversationEngine', () => ({
  ConversationRequestSchema: { safeParse: (data: unknown) => ({ success: true, data }) },
  generateConversationReply: jest.fn().mockResolvedValue({ stream: new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('reply')); c.close(); } }) }),
}));
jest.mock('@/lib/security/apiAuth', () => ({ requireAuth: jest.fn().mockResolvedValue({ userId: 'test' }), handleAuthError: jest.fn(), getClientIP: () => '127.0.0.1' }));
jest.mock('@/lib/security/rateLimit', () => ({ limitApiEndpoint: jest.fn().mockResolvedValue({ success: true }) }));
jest.mock('@/lib/security/inputValidation', () => ({ promptSchema: { safeParse: () => ({ success: true }) }, validateRequestSize: jest.fn(), ValidationError: class extends Error {} }));
jest.mock('@/lib/ucol/runtimeContextResolver', () => ({ resolveRuntimeContext: jest.fn().mockResolvedValue({ mode: 'fast', ucolContext: { workspaceId: null } }) }));
jest.mock('@/lib/ucol/routing/decision', () => ({ buildInitialRoutingDecision: () => ({}) }));
jest.mock('@/lib/subscription/credits', () => ({ calculateInteractionCost: () => 0, getUserCredits: jest.fn().mockResolvedValue(10) }));
jest.mock('@/lib/entitlements/documents', () => ({ checkDocumentEntitlement: () => ({ allowed: true }) }));
jest.mock('@/lib/ucol/runtimeBridge', () => ({ runRuntimeBridge: jest.fn(async (options) => {
  const result = await options.execute({});
  return new Response(result.stream);
}) }));
jest.mock('@/lib/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn() } }));
jest.mock('@/lib/supabaseClient', () => ({ supabaseAdmin: null }));
jest.mock('@/lib/subscription/interaction-tracker', () => ({ trackFreeInteraction: jest.fn().mockResolvedValue({ shouldNudge: false }) }));
jest.mock('@/lib/telemetry', () => ({ logEvent: jest.fn() }));

import { POST } from '@/app/api/chat/route';
import { requireAuth } from '@/lib/security/apiAuth';
import { generateConversationReply } from '@/lib/llm/conversationEngine';
import { trackFreeInteraction } from '@/lib/subscription/interaction-tracker';
const request = () => new Request('https://lattice.test/api/chat', { method: 'POST', body: JSON.stringify({ prompt: 'hello' }) });

describe('chat route deadline wiring', () => {
  beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); });
  afterEach(() => jest.useRealTimers());

  test('returns a controlled 504 if authentication stalls past the shared deadline', async () => {
    (requireAuth as jest.Mock).mockImplementationOnce(() => new Promise(() => {}));
    const pending = POST(request());
    await jest.advanceTimersByTimeAsync(270_001);
    const response = await pending;
    expect(response.status).toBe(504);
    expect((await response.json()).error).toBe('Request timed out');
    expect(generateConversationReply).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  test('passes the shared signal and request ID to inference; optional tracking cannot hold the response', async () => {
    (trackFreeInteraction as jest.Mock).mockImplementationOnce(() => new Promise(() => {}));
    const pending = POST(request());
    await jest.advanceTimersByTimeAsync(1_001);
    const response = await pending;
    expect(await response.text()).toBe('reply');
    const options = (generateConversationReply as jest.Mock).mock.calls[0][1];
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.requestId).toBe(response.headers.get('X-Lattice-Request-Id'));
    expect(jest.getTimerCount()).toBe(0);
  });

  test('a stalled response body gets an interruption marker and upstream cancellation', async () => {
    const cancel = jest.fn();
    (generateConversationReply as jest.Mock).mockResolvedValueOnce({ stream: new ReadableStream({ cancel }) });
    const response = await POST(request());
    const text = response.text();
    await jest.advanceTimersByTimeAsync(270_001);
    expect(await text).toContain('__PROVIDER_ERROR_EVENT__');
    expect(cancel).toHaveBeenCalledTimes(1);
    expect((generateConversationReply as jest.Mock).mock.calls[0][1].signal.aborted).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  });

});
