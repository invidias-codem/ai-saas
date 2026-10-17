jest.mock('@/lib/env', () => ({ nvidiaNimConfig: () => ({ apiKey: 'test', baseUrl: 'https://nim.test/v1' }) }));
jest.mock('@/lib/logger', () => ({ logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() } }));
import { NvidiaNimProvider } from './nvidiaNim';

const encode = (text: string) => new TextEncoder().encode(text);
const frame = (content: string) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; });

function upstream(chunks: string[], cancel = jest.fn()) {
  let index = 0;
  return new ReadableStream<Uint8Array>({
    pull(c) { if (index < chunks.length) c.enqueue(encode(chunks[index++])); },
    cancel,
  });
}

describe('NIM SSE stream progress', () => {
  test('reads past role-only and fragmented frames without waiting for another downstream pull', async () => {
    const data = frame('hello');
    const cancel = jest.fn();
    global.fetch = jest.fn().mockResolvedValue(new Response(upstream([
      'data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n', data.slice(0, 16), data.slice(16), 'data: [DONE]\n\n',
    ], cancel)));
    const result = await new NvidiaNimProvider().generateStream([]);
    const reader = result.stream.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toBe('hello');
    expect((await reader.read()).done).toBe(true);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  test('parses a final frame without a trailing newline at EOF', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response(new ReadableStream({
      start(c) { c.enqueue(encode(frame('final').trimEnd())); c.close(); },
    })));
    const result = await new NvidiaNimProvider().generateStream([]);
    expect(await new Response(result.stream).text()).toBe('final');
  });

  test('consumer cancellation aborts the HTTP request and cancels the body', async () => {
    const cancel = jest.fn();
    const fetchMock = jest.fn().mockResolvedValue(new Response(upstream([frame('hi')], cancel)));
    global.fetch = fetchMock;
    const result = await new NvidiaNimProvider().generateStream([]);
    await result.stream.cancel('disconnect');
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
