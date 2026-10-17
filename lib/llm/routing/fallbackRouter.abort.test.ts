jest.mock('@/lib/llm/providers/minimaxM1', () => ({ MiniMaxM1Provider: jest.fn() }));
jest.mock('@/lib/llm/providers/gemini', () => ({ GeminiProvider: jest.fn() }));
jest.mock('./circuitBreaker', () => ({ checkCircuit: jest.fn().mockResolvedValue(true), recordCircuitFailure: jest.fn(), recordCircuitSuccess: jest.fn() }));
jest.mock('@/lib/logger', () => ({ logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() } }));
jest.mock('@/lib/env', () => ({ nvidiaNimConfig: () => ({ apiKey: 'test', baseUrl: 'https://nim.test/v1' }) }));
import { executeWithFallback } from './fallbackRouter';
import { recordCircuitFailure, recordCircuitSuccess } from './circuitBreaker';
import type { LLMProvider, StreamResult } from '@/lib/llm/types';

const originalGoogleKey = process.env.GOOGLE_API_KEY;
beforeEach(() => { delete process.env.GOOGLE_API_KEY; });
afterEach(() => {
  if (originalGoogleKey === undefined) delete process.env.GOOGLE_API_KEY;
  else process.env.GOOGLE_API_KEY = originalGoogleKey;
});

describe('fallback router request cancellation', () => {
  beforeEach(() => jest.clearAllMocks());
  test('does not retry or penalize a provider when the caller aborts connection', async () => {
    let resolve!: (result: StreamResult) => void;
    const provider = { generateStream: jest.fn(() => new Promise<StreamResult>(r => { resolve = r; })) };
    const controller = new AbortController();
    const pending = executeWithFallback({ primary: { providerId: 'test', modelId: 'test', provider: provider as unknown as LLMProvider }, messages: [], signal: controller.signal });
    await new Promise(r => setTimeout(r, 0));
    const rejected = expect(pending).rejects.toThrow('cancelled');
    controller.abort(new Error('cancelled'));
    await rejected;
    expect(recordCircuitFailure).not.toHaveBeenCalled();
    expect(recordCircuitSuccess).not.toHaveBeenCalled();
    const cancel = jest.fn();
    resolve({ stream: new ReadableStream({ cancel }) });
    await Promise.resolve();
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  test('aborts a stalled first-token gate and cancels its source', async () => {
    const cancel = jest.fn();
    const provider = { generateStream: jest.fn().mockResolvedValue({ stream: new ReadableStream({ cancel }) }) };
    const controller = new AbortController();
    const pending = executeWithFallback({ primary: { providerId: 'test', modelId: 'test', provider: provider as unknown as LLMProvider }, messages: [], signal: controller.signal });
    await new Promise(r => setTimeout(r, 0));
    const rejected = expect(pending).rejects.toThrow('cancelled');
    controller.abort(new Error('cancelled'));
    await rejected;
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(recordCircuitFailure).not.toHaveBeenCalled();
    expect(recordCircuitSuccess).not.toHaveBeenCalled();
  });
});

describe('fallback deadlines and short output', () => {
  beforeEach(() => { jest.clearAllMocks(); jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  test('accepts a single genuine character while the provider remains open', async () => {
    const { gateStreamOnFirstChunk } = await import('./fallbackRouter');
    const source = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new TextEncoder().encode('x')); } });
    const gate = gateStreamOnFirstChunk(source);
    await expect(gate.firstChunk).resolves.toBeUndefined();
    await gate.stream.cancel();
  });

  test('times out a silent hop, cancels it, and advances to a healthy fallback', async () => {
    process.env.GOOGLE_API_KEY = 'test';
    const { GeminiProvider } = await import('@/lib/llm/providers/gemini');
    const next = jest.fn().mockResolvedValue({ stream: new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('ok')); c.close(); } }) });
    (GeminiProvider as jest.Mock).mockImplementation(() => ({ generateStream: next }));
    const cancel = jest.fn(() => new Promise<void>(() => {}));
    const provider = { generateStream: jest.fn().mockResolvedValue({ stream: new ReadableStream({ cancel }) }) };
    const resultPromise = executeWithFallback({ primary: { providerId: 'test', modelId: 'test', provider: provider as unknown as LLMProvider }, messages: [], enableMiniMax: false, firstTokenTimeoutMs: 20 });
    await jest.advanceTimersByTimeAsync(21);
    const result = await resultPromise;
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(1);
    expect(provider.generateStream.mock.calls[0][2].signal.aborted).toBe(true);
    expect(await new Response(result.stream).text()).toContain('ok');
    delete process.env.GOOGLE_API_KEY;
  });

  test('a shared deadline stops retries even when a provider ignores cancellation', async () => {
    const provider = { generateStream: jest.fn(() => new Promise<StreamResult>(() => {})) };
    const pending = executeWithFallback({ primary: { providerId: 'test', modelId: 'test', provider: provider as unknown as LLMProvider }, messages: [], enableMiniMax: false, totalTimeoutMs: 25, firstTokenTimeoutMs: 100 });
    const assertion = expect(pending).rejects.toThrow('request_deadline');
    await jest.advanceTimersByTimeAsync(26);
    await assertion;
    expect(recordCircuitFailure).not.toHaveBeenCalled();
  });
});

describe('fallback body lifetime', () => {
  beforeEach(() => { jest.clearAllMocks(); jest.useFakeTimers(); });
  afterEach(() => jest.useRealTimers());

  test('does not reset the total budget after accepting a token; closes with an interruption marker', async () => {
    const cancel = jest.fn();
    const provider = { generateStream: jest.fn().mockResolvedValue({ stream: new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('hi')); }, cancel }) }) };
    const result = await executeWithFallback({ primary: { providerId: 'test', modelId: 'test', provider: provider as unknown as LLMProvider }, messages: [], enableMiniMax: false, totalTimeoutMs: 40 });
    const text = new Response(result.stream).text();
    await jest.advanceTimersByTimeAsync(41);
    expect(await text).toContain('__PROVIDER_ERROR_EVENT__');
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  test('preserves UTF-8 bytes split across the first two chunks', async () => {
    const { gateStreamOnFirstChunk } = await import('./fallbackRouter');
    const bytes = new TextEncoder().encode('hi€');
    const gate = gateStreamOnFirstChunk(new ReadableStream({ start(c) { c.enqueue(bytes.slice(0, 3)); c.enqueue(bytes.slice(3)); c.close(); } }));
    await gate.firstChunk;
    expect(await new Response(gate.stream).text()).toBe('hi€');
  });

  test('recognizes a provider error marker split across chunk boundaries', async () => {
    const { gateStreamOnFirstChunk } = await import('./fallbackRouter');
    const marker = '__PROVIDER_ERROR_EVENT__:{"reason":"empty"}';
    const cancel = jest.fn();
    const gate = gateStreamOnFirstChunk(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(marker.slice(0, 8))); c.enqueue(new TextEncoder().encode(marker.slice(8))); }, cancel }));
    await expect(gate.firstChunk).rejects.toThrow('failed before first token');
    expect(await new Response(gate.stream).text()).toBe('');
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});


describe('NIM parser and fallback integration', () => {
  test('accepts NIM output after metadata and split frames without switching providers', async () => {
    const { NvidiaNimProvider } = await import('@/lib/llm/providers/nvidiaNim');
    const originalFetch = global.fetch;
    try {
      const chunks = [
        'data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n',
        'data: {"choices":[{"delta":',
        '{"content":"answer"}}]}\n\n',
        'data: [DONE]\n\n',
      ];
      global.fetch = jest.fn().mockResolvedValue(new Response(new ReadableStream({
        start(c) { for (const chunk of chunks) c.enqueue(new TextEncoder().encode(chunk)); c.close(); },
      })));
      const result = await executeWithFallback({
        primary: { providerId: 'deepseek', modelId: 'nemotron', provider: new NvidiaNimProvider() },
        messages: [], enableMiniMax: false,
      });
      expect(await new Response(result.stream).text()).toBe('answer');
      expect(result.switched).toBe(false);
    } finally { global.fetch = originalFetch; }
  });
});
