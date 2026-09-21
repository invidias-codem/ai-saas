/**
 * Streaming lifecycle contract — providers must never error() a
 * client-facing stream mid-flight (Vercel FUNCTION_INVOCATION_FAILED root cause).
 *
 * Locks:
 *   1. NIM/MiniMax: mid-stream death → __PROVIDER_ERROR_EVENT__ marker + clean
 *      close. Stream read() completes without throwing.
 *   2. NIM: pre-first-token HTTP failure still throws (fallback router hops).
 *   3. Fallback router: circuit success only after first chunk; death before
 *      first token tries the next hop.
 *   4. Envelope codec: marker round-trips.
 */
import {
  NvidiaNimProvider,
  NIM_MODEL_DEEPSEEK_V4_PRO,
} from '@/lib/llm/providers/nvidiaNim';
import { encodeProviderErrorEvent, decodeProviderErrorEvent, PROVIDER_ERROR_EVENT_PREFIX } from '@/lib/media/envelope';

// ── env ──
process.env.NVIDIA_API_KEY = 'test-key';
process.env.NIM_CONNECT_TIMEOUT_MS = '5000';
process.env.NIM_IDLE_TIMEOUT_MS = '50'; // 50ms for fast tests
process.env.NIM_TOTAL_STREAM_BUDGET_MS = '30000';

jest.mock('@/lib/env', () => ({
  nvidiaNimConfig: () => ({ apiKey: 'test-key', baseUrl: 'https://integrate.api.nvidia.com/v1' }),
}));

// ── helpers ──
function sseStreamFrom(chunks: string[], opts: { failAfter?: number; delayMs?: number } = {}) {
  const enc = new TextEncoder();
  let i = 0;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (opts.failAfter !== undefined && i >= opts.failAfter) {
        controller.error(new Error('simulated upstream death'));
        return;
      }
      if (i >= chunks.length) {
        controller.close();
        return;
      }
      if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
      controller.enqueue(enc.encode(chunks[i++]));
    },
  });
}

async function drainWithoutThrow(s: ReadableStream<Uint8Array>): Promise<{ text: string; threw: boolean }> {
  const reader = s.getReader();
  const dec = new TextDecoder();
  let text = '';
  let threw = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      text += dec.decode(value, { stream: true });
    }
  } catch {
    threw = true;
  }
  return { text, threw };
}

// ── NIM provider fetch mock ──
const fetchMock = jest.fn();
(globalThis as any).fetch = fetchMock;

function nimResponse(stream: ReadableStream, status = 200) {
  return new Response(stream, { status });
}

// ── tests ──
describe('streaming lifecycle — never error() a client stream mid-flight', () => {
  beforeEach(() => jest.clearAllMocks());

  it('marker envelope round-trips', () => {
    const ev = { provider: 'nvidia-nim', model: 'm', reason: 'idle_timeout (no chunks for 50ms)' };
    const line = encodeProviderErrorEvent(ev);
    expect(line.startsWith(PROVIDER_ERROR_EVENT_PREFIX)).toBe(true);
    const decoded = decodeProviderErrorEvent(line.trim());
    expect(decoded?.reason).toBe(ev.reason);
    expect(decoded?.ts).toBeTruthy();
  });

  it('NIM mid-stream death: marker + clean close, read() never throws', async () => {
    const chunks = ['data: {"choices":[{"delta":{"content":"hello"}}]}\n\n'];
    fetchMock.mockResolvedValueOnce(
      nimResponse(sseStreamFrom(chunks, { failAfter: 1, delayMs: 10 }))
    );

    const p = new NvidiaNimProvider();
    const result = await p.generateStream([{ role: 'user', text: 'hi' } as any]);
    const { text, threw } = await drainWithoutThrow(result.stream);

    expect(threw).toBe(false); // ← the 500-killer: no stream error
    expect(text).toContain('hello');
    expect(text).toContain(PROVIDER_ERROR_EVENT_PREFIX);
    const marker = decodeProviderErrorEvent(
      text.slice(text.indexOf(PROVIDER_ERROR_EVENT_PREFIX)).trim()
    );
    expect(marker?.provider).toBe('nvidia-nim');
  });

  it('NIM idle watchdog fires: marker emitted, stream still closes cleanly', async () => {
    // Stream that never sends anything after headers (idle timeout 50ms).
    fetchMock.mockResolvedValueOnce(
      nimResponse(new ReadableStream({ start() { /* silent */ } }))
    );

    const p = new NvidiaNimProvider();
    const result = await p.generateStream([{ role: 'user', text: 'hi' } as any]);
    const { text, threw } = await drainWithoutThrow(result.stream);

    expect(threw).toBe(false);
    expect(text).toContain(PROVIDER_ERROR_EVENT_PREFIX);
    expect(text).not.toContain('hello');
  });

  it('NIM HTTP failure (pre-first-token) still throws → fallback router hops', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('upstream error', { status: 500 })
    );

    const p = new NvidiaNimProvider();
    await expect(
      p.generateStream([{ role: 'user', text: 'hi' } as any])
    ).rejects.toThrow(/NVIDIA NIM error \(500\)/);
  });

  it('NIM healthy stream: no marker, closes normally', async () => {
    const chunks = [
      'data: {"choices":[{"delta":{"content":"a"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"b"}}]}\n\n',
      'data: [DONE]\n\n',
    ];
    fetchMock.mockResolvedValueOnce(nimResponse(sseStreamFrom(chunks)));

    const p = new NvidiaNimProvider();
    const result = await p.generateStream([{ role: 'user', text: 'hi' } as any]);
    const { text, threw } = await drainWithoutThrow(result.stream);

    expect(threw).toBe(false);
    expect(text).toBe('ab');
    expect(text).not.toContain(PROVIDER_ERROR_EVENT_PREFIX);
  });
});

// ── fallback router first-chunk gate ──
describe('fallback router — first-chunk gate', () => {
  it('records failure and hops when the stream dies before first token', async () => {
    const { executeWithFallback } = await import('@/lib/llm/routing/fallbackRouter');

    const deadOnArrival = {
      generateStream: async () => ({
        stream: new ReadableStream({
          async start(c) {
            // Dies before producing any byte.
            c.error(new Error('DOA'));
          },
        }),
      }),
      id: 'doa',
      name: 'DOA',
    } as any;

    // Gemini hop unavailable (no key) + MiniMax disabled → chain is DOA-only,
    // so the router MUST throw "exhausted" — it never returns the dead stream.
    delete process.env.GOOGLE_API_KEY;
    delete process.env.OPENROUTER_API_KEY;

    await expect(
      executeWithFallback({
        primary: { providerId: 'doa', modelId: 'doa-model', provider: deadOnArrival },
        messages: [],
        enableMiniMax: false,
      })
    ).rejects.toThrow(/exhausted|died before first token/);
  });

  it('gateStreamOnFirstChunk resolves on first byte, rejects on early close', async () => {
    const { gateStreamOnFirstChunk } = await import('@/lib/llm/routing/fallbackRouter') as any;
    const enc = new TextEncoder();

    // First byte flows → resolves.
    const good = gateStreamOnFirstChunk(
      new ReadableStream({
        start(c) {
          c.enqueue(enc.encode('x'));
          c.close();
        },
      })
    );
    await expect(good.firstChunk).resolves.toBeUndefined();

    // Closes with nothing → rejects.
    const empty = gateStreamOnFirstChunk(
      new ReadableStream({
        start(c) {
          c.close();
        },
      })
    );
    await expect(empty.firstChunk).rejects.toThrow(/closed before first chunk/);
  });
});
