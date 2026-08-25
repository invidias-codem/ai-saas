/**
 * lib/jepa/circuitBreaker.ts
 *
 * In-memory sliding-window circuit breaker for JEPA encoder calls.
 * Designed for Vercel serverless: state is per-container and self-resets
 * when the instance is recycled.
 *
 * States:
 *  - closed  : normal operation
 *  - open    : failing fast, returning fallback without calling JEPA
 *  - half-open: allowing one probe request after cooldown
 */

export type CircuitState = 'closed' | 'open' | 'half-open';

const DEFAULT_FAILURE_THRESHOLD = 5;
const DEFAULT_COOLDOWN_MS = 30_000;
const DEFAULT_HALF_OPEN_MAX_PROBES = 1;

export interface CircuitBreakerOptions {
  /** Number of recent failures/latency violations required to open the circuit. */
  failureThreshold?: number;
  /** Time in ms to stay open before transitioning to half-open. */
  cooldownMs?: number;
  /** Max probes allowed in half-open before closing or reopening. */
  halfOpenMaxProbes?: number;
  /** Latency budget in ms; any measured latency above this counts as a failure. */
  latencyBudgetMs?: number;
}

export class CircuitBreaker {
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;
  private readonly halfOpenMaxProbes: number;
  private readonly latencyBudgetMs: number;

  private state: CircuitState = 'closed';
  private failures: number = 0;
  private openedAt: number = 0;
  private probesInHalfOpen: number = 0;

  constructor(opts: CircuitBreakerOptions = {}) {
    this.failureThreshold = opts.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD;
    this.cooldownMs = opts.cooldownMs ?? DEFAULT_COOLDOWN_MS;
    this.halfOpenMaxProbes = opts.halfOpenMaxProbes ?? DEFAULT_HALF_OPEN_MAX_PROBES;
    this.latencyBudgetMs = opts.latencyBudgetMs ?? 600;
  }

  /** Return whether a JEPA call is allowed. */
  allowRequest(): boolean {
    if (this.state === 'closed') {
      return true;
    }

    if (this.state === 'half-open') {
      if (this.probesInHalfOpen < this.halfOpenMaxProbes) {
        this.probesInHalfOpen++;
        return true;
      }
      return false;
    }

    // open
    if (Date.now() - this.openedAt >= this.cooldownMs) {
      this.transitionTo('half-open');
      this.probesInHalfOpen = 1;
      return true;
    }

    return false;
  }

  /** Record a successful JEPA call. */
  recordSuccess(): void {
    if (this.state === 'half-open') {
      this.transitionTo('closed');
    }
    this.failures = 0;
  }

  /** Record a failed JEPA call, including latency violations. */
  recordFailure(totalMs: number): void {
    const isLatencyViolation = totalMs > this.latencyBudgetMs;
    this.failures++;

    if (this.state === 'half-open' || isLatencyViolation) {
      this.transitionTo('open');
      return;
    }

    if (this.state === 'closed' && this.failures >= this.failureThreshold) {
      this.transitionTo('open');
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  getFailureCount(): number {
    return this.failures;
  }

  private transitionTo(next: CircuitState): void {
    this.state = next;
    if (next === 'open') {
      this.openedAt = Date.now();
      this.probesInHalfOpen = 0;
    }
    if (next === 'half-open') {
      this.probesInHalfOpen = 0;
    }
  }
}

export const jepaCircuitBreaker = new CircuitBreaker({
  latencyBudgetMs: 600,
});
