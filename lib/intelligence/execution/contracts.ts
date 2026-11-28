// lib/intelligence/execution/contracts.ts
// UCOL Execution Plane — neutral contracts (Slice: ExecutionRuntime).
//
// ARCHITECTURE (locked, mirrors the Decision Plane rule):
//   UCOL expresses an executionRequirement.
//   Deterministic policy resolves it against REGISTERED capabilities.
//   Adapters provision. Nothing here provisions anything.
//   Evidence records what actually happened.
//
// Compute is a ROUTABLE RESOURCE: Lattice never depends on a concrete
// runtime provider (Daytona / Modal / local / Lattice Cloud), exactly as it
// never depends on a concrete LLM provider. Persistence is POLICY-RELEVANT
// STATE, not provider behavior — the resolver reads it, adapters honor it.
//
// This slice is CONTRACTS ONLY: no provider SDKs, no network, no I/O.

import { z } from 'zod';

// ── What UCOL asks for ──────────────────────────────────────────────────

export const RuntimeTypeSchema = z.enum([
  'none',
  'browser',
  'container',
  'linux_vm',
  'windows_vm',
  'macos',
]);
export type RuntimeType = z.infer<typeof RuntimeTypeSchema>;

export const RuntimePersistenceSchema = z.enum(['request', 'task', 'workspace', 'personal']);
export type RuntimePersistence = z.infer<typeof RuntimePersistenceSchema>;

export const ExecutionRequirementSchema = z.object({
  required: z.boolean(),
  runtimeType: RuntimeTypeSchema,
  persistence: RuntimePersistenceSchema,
});
export type ExecutionRequirement = z.infer<typeof ExecutionRequirementSchema>;

/** The abstention default — used until B2 emits real requirements. */
export const NO_EXECUTION_REQUIRED: ExecutionRequirement = {
  required: false,
  runtimeType: 'none',
  persistence: 'request',
};

// ── Runtime lifecycle surface ───────────────────────────────────────────

export interface RuntimeSpec {
  runtimeType: RuntimeType;
  persistence: RuntimePersistence;
  /** Resource ceiling; adapters map to provider units. */
  memoryMb?: number;
  cpuShares?: number;
  /** Files/env to seed the machine with. Adapters own transport. */
  seedFiles?: Array<{ path: string; content: string }>;
  env?: Record<string, string>;
  labels?: Record<string, string>;
}

export interface Runtime {
  runtimeId: string;
  runtimeType: RuntimeType;
  persistence: RuntimePersistence;
  /** Statuses adapters must report; policy reads, never infers. */
  status: 'creating' | 'ready' | 'suspended' | 'destroyed' | 'failed';
  createdAt: string;
  /** Set for persistent scopes — the key later resume() calls use. */
  resumeKey?: string;
}

export type RuntimeAction =
  | { kind: 'shell'; command: string; timeoutMs?: number }
  | { kind: 'file_read'; path: string }
  | { kind: 'file_write'; path: string; content: string }
  | { kind: 'http'; url: string; method?: string; body?: string };

export interface ActionResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
}

export interface RuntimeSnapshot {
  snapshotId: string;
  runtimeId: string;
  createdAt: string;
}

/**
 * The ONLY lifecycle surface. Six operations — no more, no less.
 * Adapters implement; nothing in the contract layer calls them.
 * Contract-locked: implementations must be idempotent on destroy and
 * suspend, and execute() must never outlive its own timeout.
 */
export interface ExecutionRuntime {
  readonly id: string;
  readonly capabilities: RuntimeCapabilities;
  create(spec: RuntimeSpec): Promise<Runtime>;
  resume(runtimeId: string): Promise<Runtime>;
  execute(runtimeId: string, action: RuntimeAction): Promise<ActionResult>;
  snapshot(runtimeId: string): Promise<RuntimeSnapshot>;
  suspend(runtimeId: string): Promise<void>;
  destroy(runtimeId: string): Promise<void>;
}

export interface RuntimeCapabilities {
  runtimeTypes: readonly RuntimeType[];
  /** Persistence scopes this adapter can actually hold across calls. */
  persistenceScopes: readonly RuntimePersistence[];
  /** True when suspend/resume survives adapter restarts. */
  durableSuspend: boolean;
  /** True when snapshot/fork is supported. */
  snapshots: boolean;
}

// ── Deterministic resolution (pure) ─────────────────────────────────────

export type RuntimeSelectionReason =
  | 'not_required'
  | 'runtime_selected'
  | 'runtime_type_unavailable'
  | 'persistence_unsupported'
  | 'no_adapters_registered';

export interface RuntimeSelection {
  /** The chosen adapter id, or null on abstention. */
  runtimeId: string | null;
  reason: RuntimeSelectionReason;
  /** Deterministic tie-break record: which adapters matched, in order. */
  considered: string[];
  requirement: ExecutionRequirement;
}

/**
 * Pure resolver: requirement + registered capabilities → selection or
 * abstention. No provisioning, no I/O, no wall-clock. Deterministic:
 * ties break on registration order, which callers control.
 */
export function resolveRuntime(
  requirement: ExecutionRequirement,
  adapters: Array<Pick<ExecutionRuntime, 'id' | 'capabilities'>>,
): RuntimeSelection {
  if (!requirement.required || requirement.runtimeType === 'none') {
    return { runtimeId: null, reason: 'not_required', considered: [], requirement };
  }
  if (adapters.length === 0) {
    return { runtimeId: null, reason: 'no_adapters_registered', considered: [], requirement };
  }

  const considered: string[] = [];
  for (const adapter of adapters) {
    if (!adapter.capabilities.runtimeTypes.includes(requirement.runtimeType)) continue;
    considered.push(adapter.id);
    if (!adapter.capabilities.persistenceScopes.includes(requirement.persistence)) continue;
    // First adapter satisfying BOTH constraints wins — registration order
    // is the deterministic policy input, mirroring B2's tier fallback.
    return { runtimeId: adapter.id, reason: 'runtime_selected', considered, requirement };
  }

  const reason: RuntimeSelectionReason =
    considered.length > 0 ? 'persistence_unsupported' : 'runtime_type_unavailable';
  return { runtimeId: null, reason, considered, requirement };
}
