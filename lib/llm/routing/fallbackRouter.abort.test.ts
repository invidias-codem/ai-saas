jest.mock('@/lib/llm/providers/minimaxM1', () => ({ MiniMaxM1Provider: jest.fn() }));
jest.mock('@/lib/llm/providers/gemini', () => ({ GeminiProvider: jest.fn() }));
jest.mock('./circuitBreaker', () => ({ checkCircuit: jest.fn().mockResolvedValue(true), recordCircuitFailure: jest.fn(), recordCircuitSuccess: jest.fn() }));
jest.mock('@/lib/logger', () => ({ logger: { warn: jest.fn(), info: jest.fn() } }));
import { executeWithFallback } from './fallbackRouter';
import { recordCircuitFailure, recordCircuitSuccess } from './circuitBreaker';
import type { LLMProvider, StreamResult } from '@/lib/llm/types';

describe('fallback router request cancellation', () => {
  beforeEach(() => jest.clearAllMocks());
  test('does not retry or penalize a provider when the caller aborts connection', async () => {
    let resolve!: (result: StreamResult) => void;
    const provider = { generateStream: jest.fn(() => new Promise<StreamResult>(r => { resolve = r; })) };
    const controller = new AbortController();
    const pending = executeWithFallback({ primary: { providerId: 'test', modelId: 'test', provider: provider as unknown as LLMProvider }, messages: [], signal: controller.signal });
    await Promise.resolve();
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
