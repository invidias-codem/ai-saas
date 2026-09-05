// lib/llm/routing/circuitBreaker.ts
// Per-provider circuit breaker for the fallback router.
//
// Backed by Upstash Redis (atomic cross-instance state) with a local in-memory
// fallback so the breaker is resilient under serverless horizontal scaling.
//
//   * Redis key:        circuit:provider:{providerName}
//     hash fields:      { state, failures, lastFailureTime }
//   * Atomic INCR/EXPIRE:  hincrby + expire drives sliding-window failure counts
//                          shared across all warm isolates (no split-brain).
//   * Fail-open:        if Redis hangs/times out, fall back to the local Map and
//                       ALLOW the request — telemetry infra must never become a
//                       single point of failure on the chat hot path.
//
// Reference: multi-provider-ai-routing skill (embedding circuit breaker +
// serialized fallback queue; cross-instance coordination via Upstash).

import { Redis } from '@upstash/redis';

interface LocalCircuitState {
  failures: number;
  lastFailureTime: number;
  state: 'CLOSED' | 'OPEN' | 'HALF-OPEN';
}

const localRegistry = new Map<string, LocalCircuitState>();

const FAILURE_THRESHOLD = 3;
const RESET_TIMEOUT_MS = 30_000; // 30s cooldown before HALF-OPEN probe
const REDIS_TIMEOUT_MS = 1_500; // fail-open budget for the shared store
const REDIS_TTL_SECONDS = 300; // 5-min safety TTL so stale keys self-expire

// Lazy singleton — only instantiate when credentials are present (matches the
// rest of the repo: budgetKillSwitch, rateLimit, traceEmitters, etc.).
function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  // Cache the client on first successful construction.
  (getRedis as any)._client ??= new Redis({ url, token });
  return (getRedis as any)._client ?? null;
}

/** Race a Redis call against a timeout so it can never block the hot path. */
async function withTimeout<T>(p: Promise<T>): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Redis timeout')), REDIS_TIMEOUT_MS)
    ),
  ]);
}

/** True when the provider should be attempted (CLOSED, or OPEN+cooldown elapsed). */
export async function checkCircuit(providerKey: string): Promise<boolean> {
  const key = `circuit:provider:${providerKey}`;
  const redis = getRedis();

  if (redis) {
    try {
      const data = await withTimeout(
        redis.hgetall<{ state?: string; lastFailureTime?: string }>(key) as Promise<{
          state?: string;
          lastFailureTime?: string;
        } | null>
      );

      if (data && data.state === 'OPEN') {
        const lastFail = parseInt(data.lastFailureTime || '0', 10);
        if (Date.now() - lastFail > RESET_TIMEOUT_MS) {
          // Transition to HALF-OPEN (best-effort; ignore transient write failures).
          await redis.hset(key, { state: 'HALF-OPEN' }).catch(() => {});
          return true; // allow a probe
        }
        return false; // circuit OPEN — skip this provider
      }
      return true; // CLOSED or HALF-OPEN
    } catch (err) {
      console.warn(
        `[CircuitBreaker] Redis error/timeout for ${providerKey}. Failing open to local memory:`,
        err
      );
    }
  }

  // ── Local memory fallback (no Redis, or Redis unreachable) ──
  const local = localRegistry.get(providerKey);
  if (!local) return true;

  if (local.state === 'OPEN') {
    if (Date.now() - local.lastFailureTime > RESET_TIMEOUT_MS) {
      local.state = 'HALF-OPEN';
      return true;
    }
    return false;
  }
  return true;
}

/** Reset state to CLOSED (local always; Redis best-effort). */
export async function recordCircuitSuccess(providerKey: string): Promise<void> {
  const key = `circuit:provider:${providerKey}`;
  const redis = getRedis();

  localRegistry.set(providerKey, { failures: 0, lastFailureTime: 0, state: 'CLOSED' });

  if (redis) {
    try {
      await withTimeout(
        redis.hset(key, { failures: '0', lastFailureTime: '0', state: 'CLOSED' })
      );
      await withTimeout(redis.expire(key, REDIS_TTL_SECONDS));
    } catch (err) {
      console.warn(`[CircuitBreaker] Redis success-write failed for ${providerKey}:`, err);
    }
  }
}

/** Record a failure; trips OPEN after the threshold (local always; Redis atomic INCR). */
export async function recordCircuitFailure(providerKey: string): Promise<void> {
  const key = `circuit:provider:${providerKey}`;
  const now = Date.now();
  const redis = getRedis();

  // Local update (always, so fail-open still guards the single instance).
  const local = localRegistry.get(providerKey) ?? { failures: 0, lastFailureTime: 0, state: 'CLOSED' };
  local.failures += 1;
  local.lastFailureTime = now;
  if (local.failures >= FAILURE_THRESHOLD) local.state = 'OPEN';
  localRegistry.set(providerKey, local);

  if (redis) {
    try {
      // Atomic INCR for the shared sliding-window count.
      const failures = await withTimeout(redis.hincrby(key, 'failures', 1));
      await withTimeout(redis.hset(key, { lastFailureTime: now.toString() }));
      if (failures >= FAILURE_THRESHOLD) {
        await withTimeout(redis.hset(key, { state: 'OPEN' }));
      }
      await withTimeout(redis.expire(key, REDIS_TTL_SECONDS));
    } catch (err) {
      console.warn(`[CircuitBreaker] Redis failure-write failed for ${providerKey}:`, err);
    }
  }
}

/** Reset a provider's circuit (manual operator override; clears both stores). */
export async function resetCircuit(providerKey: string): Promise<void> {
  const key = `circuit:provider:${providerKey}`;
  const redis = getRedis();
  localRegistry.delete(providerKey);
  if (redis) {
    await redis.del(key).catch(() => {});
  }
}