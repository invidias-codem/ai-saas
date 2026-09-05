// lib/llm/routing/circuitBreaker.ts
// Per-provider circuit breaker for the fallback router.
//
// NOTE: in-memory (module-level Map) — matches the current single-warm-instance
// convention used elsewhere in the codebase (approvalStore historically, the
// embedding fallback queue). Under Vercel serverless with multiple cold
// isolates this state is per-instance, not global; acceptable for fail-fast
// within a request's lifetime. A Redis/Upstash-backed breaker is the known
// follow-up if cross-instance coordination is required.

interface CircuitState {
  failures: number;
  lastFailureTime: number;
  state: 'CLOSED' | 'OPEN' | 'HALF-OPEN';
}

const circuitRegistry = new Map<string, CircuitState>();

const FAILURE_THRESHOLD = 3;
const RESET_TIMEOUT_MS = 30_000; // 30s cooldown before HALF-OPEN probe

function getCircuit(key: string): CircuitState {
  return (
    circuitRegistry.get(key) ?? {
      failures: 0,
      lastFailureTime: 0,
      state: 'CLOSED',
    }
  );
}

/** True when the provider should be attempted (CLOSED or HALF-OPEN probe). */
export function checkCircuit(providerKey: string): boolean {
  const circuit = getCircuit(providerKey);

  if (circuit.state === 'OPEN') {
    if (Date.now() - circuit.lastFailureTime > RESET_TIMEOUT_MS) {
      circuit.state = 'HALF-OPEN';
      return true;
    }
    return false; // circuit still open — skip
  }

  // CLOSED or HALF-OPEN → allow
  return true;
}

/** Reset the circuit to CLOSED on a successful call. */
export function recordCircuitSuccess(providerKey: string): void {
  circuitRegistry.set(providerKey, {
    failures: 0,
    lastFailureTime: 0,
    state: 'CLOSED',
  });
}

/** Record a failure; trips the circuit OPEN after the threshold. */
export function recordCircuitFailure(providerKey: string): void {
  const circuit = getCircuit(providerKey);
  circuit.failures += 1;
  circuit.lastFailureTime = Date.now();

  if (circuit.failures >= FAILURE_THRESHOLD) {
    circuit.state = 'OPEN';
  }

  circuitRegistry.set(providerKey, circuit);
}

/** Reset a specific provider's circuit (e.g. manual operator override). */
export function resetCircuit(providerKey: string): void {
  circuitRegistry.delete(providerKey);
}