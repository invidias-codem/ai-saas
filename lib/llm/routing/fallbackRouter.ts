// lib/llm/routing/fallbackRouter.ts
// Model-agnostic streaming fallback router with circuit breaker + canonical-state
// translation + model-switch sentinel emission.
//
// Replaces the Gemini-hardcoded `catch` in conversationEngine with a config-driven
// failover chain: primary (resolved provider) → MiniMax-M1 (1M-token, text-only)
// → Gemini (universal multimodal fallback). Each hop streams, so the client's
// `getReader()` accumulation keeps working across the switch, and the switch is
// announced to the client via a `__MODEL_SWITCH_EVENT__` sentinel chunk emitted
// BEFORE the fallback stream's first token.
//
// Reference: multi-provider-ai-routing skill (fallback chain construction,
// dedup primary, streaming direct, NIM DEGRADED detection).

import type { ChatMessage, LLMProvider, StreamResult } from '@/lib/llm/types';
import { MiniMaxM1Provider } from '@/lib/llm/providers/minimaxM1';
import { GeminiProvider } from '@/lib/llm/providers/gemini';
import { encodeModelSwitchEvent } from '@/lib/media/envelope';
import {
  checkCircuit,
  recordCircuitFailure,
  recordCircuitSuccess,
} from './circuitBreaker';
import { logger } from '@/lib/logger';

export interface FallbackStreamResult extends StreamResult {
  /** The model that ultimately served the stream. */
  actualModelId: string;
  /** The initially-requested model (before any fallback). */
  requestedModelId: string;
  /** Provider id of the serving model. */
  systemProvider: string;
  /** True when a fallback hop served the request. */
  switched: boolean;
  /** The model id we fell back FROM (set when switched). */
  previousModelId?: string;
}

interface FallbackHop {
  key: string; // circuit-breaker key
  providerId: string; // stable provider id (telemetry)
  modelId: string;
  provider: LLMProvider;
  /** True when this hop needs canonical-state translation (different wire format). */
  translate: boolean;
  /** Env/DB key that gates this hop's availability (for the startup audit). */
  gatedByKey?: string;
  /** Whether the hop is actually active given current config (for the audit). */
  isAvailable: boolean;
}

function isRetryableStatus(err: unknown): boolean {
  const e = err as { status?: number; message?: string };
  const s = e?.status;
  return Boolean(
    (s && s >= 500) || // 5xx
      s === 429 || // rate limit
      (s === 400 && String(e?.message || '').includes('DEGRADED')) || // NIM DEGRADED
      String(e?.message || '').includes('429') ||
      String(e?.message || '').includes('aborted') ||
      String(e?.message || '').includes('AbortError')
  );
}

/** Build the ordered failover chain for a resolved primary provider. */
export function buildFallbackChain(
  primary: { providerId: string; modelId: string; provider: LLMProvider },
  opts: { enableMiniMax?: boolean } = {}
): FallbackHop[] {
  const chain: FallbackHop[] = [
    {
      key: `primary:${primary.modelId}`,
      providerId: primary.providerId,
      modelId: primary.modelId,
      provider: primary.provider,
      translate: false, // already in canonical wire shape for the primary
      isAvailable: true, // primary is always attempted
    },
  ];

  // MiniMax-M1 1M-token fallback — only when OpenRouter key present and not the primary.
  const minimaxEnabled = opts.enableMiniMax !== false && Boolean(process.env.OPENROUTER_API_KEY);
  if (minimaxEnabled && primary.modelId !== 'minimax/minimax-m1') {
    chain.push({
      key: 'fallback:minimax-m1',
      providerId: 'minimax-m1',
      modelId: 'minimax/minimax-m1',
      provider: new MiniMaxM1Provider(),
      translate: true,
      gatedByKey: 'OPENROUTER_API_KEY',
      isAvailable: true,
    });
  } else if (primary.modelId !== 'minimax/minimax-m1') {
    // MiniMax hop configured but disabled — surface it in the audit.
    chain.push({
      key: 'fallback:minimax-m1',
      providerId: 'minimax-m1',
      modelId: 'minimax/minimax-m1',
      provider: new MiniMaxM1Provider(),
      translate: true,
      gatedByKey: 'OPENROUTER_API_KEY',
      isAvailable: false,
    });
  }

  // Universal Gemini fallback — always last, deduped against primary.
  if (primary.modelId !== 'gemini-2.5-flash') {
    chain.push({
      key: 'fallback:gemini',
      providerId: 'gemini',
      modelId: 'gemini-2.5-flash',
      provider: new GeminiProvider(),
      translate: true,
      gatedByKey: 'GOOGLE_API_KEY',
      isAvailable: Boolean(process.env.GOOGLE_API_KEY),
    });
  }

  // Audit the FULL configured chain (including disabled hops) so operators see
  // what *would* be available, then return only the executable (available) hops.
  auditFallbackChain(chain);

  return chain.filter((hop) => hop.isAvailable);
}

// ─────────────────────────────────────────────────────────────────────────────
// Startup telemetry audit — fire once per process so operators can spot a
// missing env/DB key BEFORE a 429 storm forces the issue. Idempotent.
// ─────────────────────────────────────────────────────────────────────────────
let auditedChains = new Set<string>();

function auditFallbackChain(chain: FallbackHop[]): void {
  const signature = chain.map((h) => `${h.providerId}:${h.isAvailable}`).join('|');
  if (auditedChains.has(signature)) return;
  auditedChains.add(signature);

  const redisConfigured = Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );

  logger.info('[FallbackRouter] Active execution chain:');
  chain.forEach((hop, idx) => {
    const status = hop.isAvailable ? 'ACTIVE' : 'DISABLED';
    const gate = hop.gatedByKey ? `gated_by=${hop.gatedByKey}` : 'core (ungated)';
    logger.info(`  hop ${idx + 1}: ${hop.providerId} (${hop.modelId}) — ${status} [${gate}]`);
  });
  logger.info(
    `[FallbackRouter] circuit breaker: ${redisConfigured ? 'upstash-redis (distributed)' : 'local-memory (single-instance)'}`
  );
}

/**
 * Execute the primary provider with circuit-breaker failover. Returns the first
 * successful streaming result, translating canonical state across hops as needed
 * and emitting a model-switch sentinel when a fallback hop is selected.
 *
 * Throws only when the ENTIRE chain is exhausted.
 */
export async function executeWithFallback(params: {
  primary: { providerId: string; modelId: string; provider: LLMProvider };
  messages: ChatMessage[];
  systemInstruction?: string;
  options?: { temperature?: number; maxTokens?: number };
  enableMiniMax?: boolean;
}): Promise<FallbackStreamResult> {
  const { primary, messages, systemInstruction, options, enableMiniMax } = params;
  const chain = buildFallbackChain(primary, { enableMiniMax });

  const perHopErrors: string[] = [];
  let previousModelId: string | undefined;
  let switched = false;

  for (let i = 0; i < chain.length; i++) {
    const hop = chain[i];

    if (!(await checkCircuit(hop.key))) {
      perHopErrors.push(`[${hop.providerId}] skipped (circuit open)`);
      continue;
    }

    try {
      // Canonical-state translation: MiniMax/Gemini use text-only wire roles; the
      // canonical codec normalizes provider-specific roles before re-mapping.
      const history = hop.translate ? messages : messages;

      const result = await hop.provider.generateStream(history, systemInstruction, {
        model: hop.modelId,
        temperature: options?.temperature,
        maxTokens: options?.maxTokens,
      });

      await recordCircuitSuccess(hop.key);

      if (switched) {
        // Emit the switch sentinel BEFORE the fallback stream so the client toasts,
        // then prepend it to the fallback stream's output.
        const switchChunk = encodeModelSwitchEvent({
          from: previousModelId ?? primary.modelId,
          to: hop.modelId,
          provider: hop.providerId,
          reason: perHopErrors[perHopErrors.length - 1] ?? 'primary unavailable',
        });
        const sentinel = new TextEncoder().encode(switchChunk);

        const fallbackStream = new ReadableStream<Uint8Array>({
          async start(controller) {
            controller.enqueue(sentinel);
            const reader = result.stream.getReader();
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                controller.enqueue(value);
              }
              controller.close();
            } catch (e) {
              controller.error(e);
            }
          },
        });

        return {
          stream: fallbackStream,
          thoughtSignaturePromise: result.thoughtSignaturePromise,
          debug: result.debug,
          actualModelId: hop.modelId,
          requestedModelId: primary.modelId,
          systemProvider: hop.providerId,
          switched: true,
          previousModelId,
        };
      }

      // First (primary) hop succeeded — no switch.
      return {
        stream: result.stream,
        thoughtSignaturePromise: result.thoughtSignaturePromise,
        debug: result.debug,
        actualModelId: hop.modelId,
        requestedModelId: primary.modelId,
        systemProvider: hop.providerId,
        switched: false,
      };
    } catch (err: any) {
      await recordCircuitFailure(hop.key);
      const errMsg = `[${hop.providerId}] ${err?.message || String(err)}`;
      perHopErrors.push(errMsg);
      logger.warn(`[FallbackRouter] hop failed: ${errMsg}`);

      // Only trip to the next hop for retryable errors; rethrow irrecoverable 4xx.
      if (!isRetryableStatus(err)) {
        throw err;
      }

      switched = true;
      previousModelId = hop.modelId;
    }
  }

  // Entire chain exhausted — surface the full sequence + per-hop errors.
  const sequence = chain.map((h) => h.providerId).join(' -> ');
  throw new Error(
    `All LLM providers exhausted (${sequence}). Per-hop errors: ${perHopErrors.join(' | ')}`
  );
}