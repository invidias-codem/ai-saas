// lib/vdi/store/desktopStoreInterface.ts
// Interface for desktop store - allows swapping implementations (Supabase vs Memory)

import type {
  TenantScope,
  DesktopSpec,
  DesktopPhase,
  Desktop,
  DesktopSessionLease,
  ExecutionLease,
  DesktopSnapshot,
  DesktopPolicy,
} from '@/lib/intelligence/execution/vdi/contracts';
import type { IdempotentProvisioner } from '@/lib/intelligence/execution/vdi/contracts';
import type { VdiDesktopRow, VdiSessionLeaseRow, VdiExecutionLeaseRow, VdiConnectionGrantRow, VdiInputControlLeaseRow, VdiOperationKeyRow, VdiEvidenceRow } from './desktopStore';

export interface DesktopStore {
  // Desktop CRUD
  createDesktop(args: {
    desktopId: string;
    spec: DesktopSpec;
    scope: TenantScope;
    provider: string;
    providerId: string;
    providerRegion?: string | null;
    operationKey?: string | null;
    specHash: string;
  }): Promise<VdiDesktopRow>;

  getDesktopById(desktopId: string, scope: TenantScope): Promise<VdiDesktopRow | null>;
  getDesktopByProviderId(provider: string, providerId: string, scope: TenantScope): Promise<VdiDesktopRow | null>;
  updateDesktopPhase(desktopId: string, scope: TenantScope, phase: DesktopPhase, expectedGeneration: number): Promise<VdiDesktopRow>;
  updateDesktopResumeKey(desktopId: string, scope: TenantScope, resumeKey: string, expectedGeneration: number): Promise<VdiDesktopRow>;
  listDesktops(scope: TenantScope): Promise<VdiDesktopRow[]>;

  // Session Leases
  grantSessionLease(args: {
    desktopId: string;
    sessionId: string;
    userId: string;
    connectionGrant: string;
    ttlMs: number;
    scope: TenantScope;
  }): Promise<VdiSessionLeaseRow>;

  revokeSessionLease(desktopId: string, sessionId: string, scope: TenantScope, revokedBy: string, revokedReason: string): Promise<void>;
  getActiveSessionLease(desktopId: string, scope: TenantScope): Promise<VdiSessionLeaseRow | null>;

  // Execution Leases
  grantExecutionLease(args: {
    desktopId: string;
    executionId: string;
    agentId: string;
    ttlMs: number;
    scope: TenantScope;
  }): Promise<VdiExecutionLeaseRow>;

  revokeExecutionLease(desktopId: string, executionId: string, scope: TenantScope, revokedBy: string, revokedReason: string): Promise<void>;
  getActiveExecutionLease(desktopId: string, scope: TenantScope): Promise<VdiExecutionLeaseRow | null>;

  // Connection Grants
  createConnectionGrant(args: {
    desktopId: string;
    sessionLeaseId: string;
    grantToken: string;
    protocol: string;
    ttlMs: number;
  }): Promise<VdiConnectionGrantRow>;

  revokeConnectionGrants(desktopId: string, reason: string): Promise<void>;
  validateConnectionGrant(grantToken: string): Promise<{ desktopId: string; sessionLeaseId: string; protocol: string } | null>;

  // Input Control Leases
  grantInputControlLease(args: {
    desktopId: string;
    leaseId: string;
    holderType: 'human' | 'agent';
    holderId: string;
    ttlMs: number;
    scope: TenantScope;
  }): Promise<VdiInputControlLeaseRow>;

  revokeInputControlLease(desktopId: string, leaseId: string, scope: TenantScope, reason: string): Promise<void>;
  getActiveInputControlLease(desktopId: string, scope: TenantScope): Promise<VdiInputControlLeaseRow | null>;

  // Operation Keys
  checkOperationKey(operationKey: string): Promise<{ desktopId: string } | { status: 'in_progress' } | null>;
  recordOperationKey(operationKey: string, outcome: { desktopId: string; providerId: string } | { error: string }): Promise<void>;

  // Evidence
  recordEvidence(event: {
    desktopId: string;
    operationKey?: string | null;
    operationType: string;
    desiredState?: string | null;
    observedState?: string | null;
    timingMs?: number | null;
    failureClass?: string | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<void>;

  // Fleet observations (VDI-3A): one current observation per desktop.
  // Records what provider/guest LAST REPORTED — never mutates desktop state.
  recordObservation(outcome: {
    desktopId: string;
    providerReachable: boolean;
    providerPhase: string | null;
    providerClass: string | null;
    providerObservedAt: string | null;
    providerError: string | null;
    guestDisplayHealthy: boolean | null;
    guestError: string | null;
    guestObservedAt: string | null;
    brokerPhase: string;
    generation: number;
    sessionLeaseActive: boolean;
    executionLeaseActive: boolean;
    inputControlHolder: string | null;
    lastOperationKey: string | null;
  }): Promise<void>;

  getObservation(desktopId: string): Promise<{
    providerPhase: string | null;
    providerClass: string | null;
    providerObservedAt: string | null;
    [k: string]: unknown;
  } | null>;

  // Alerts (VDI-3C): one open alert per desktop+rule+generation. Upsert
  // deduplicates opens and requires fresh evidence to resolve.
  upsertAlert(args: {
    desktopId: string;
    tenantId: string;
    workspaceId: string;
    rule: string;
    severity: string;
    generation: number;
    detail: Record<string, unknown> | null;
    resolve: boolean;
    /** Observation timestamp justifying resolution; must be fresh. */
    evidenceAt?: string;
    /** Evaluator-provided time; stores never invent timestamps. */
    evaluatedAt?: string;
  }): Promise<string | null>;

  listAlerts(scope: TenantScope, status?: 'open' | 'resolved'): Promise<Array<{
    desktopId: string;
    rule: string;
    severity: string;
    generation: number;
    status: string;
    firstObservedAt: string;
    lastEvaluatedAt: string;
    resolvedAt: string | null;
    detail: Record<string, unknown> | null;
  }>>;

  // Usage accounting (VDI-3C): idempotent per resource+interval.
  getUsageRecord(providerId: string, intervalStart: string, intervalEnd: string): Promise<Record<string, unknown> | null>;

  recordUsage(args: {
    tenantId: string;
    workspaceId: string;
    desktopId: string;
    providerId: string;
    intervalStart: string;
    intervalEnd: string;
    phaseAtStart: string;
    phaseAtEnd: string | null;
    completeness: 'complete' | 'partial' | 'gap';
    gapReason: string | null;
    source: string;
    runtimeSeconds: number | null;
    estimatedCostUsd: number | null;
    estimateRateVersion: string | null;
    providerReportedCostUsd: number | null;
  }): Promise<void>;

  listUsage(scope: TenantScope): Promise<Array<{
    providerId: string;
    intervalStart: string;
    intervalEnd: string;
    completeness: string;
    runtimeSeconds: number | null;
    estimatedCostUsd: number | null;
    estimateRateVersion: string | null;
    providerReportedCostUsd: number | null;
  }>>;

  // Remediation attempts (VDI-4A): durable, restart-surviving counters.
  // Returns the attempt number after increment, or -1 when the limit was
  // already exhausted (no increment, no second escalation).
  recordRemediationAttempt(args: {
    desktopId: string;
    tenantId: string;
    workspaceId: string;
    rule: string;
    policyVersion: string;
    limit: number;
    attemptedAt: string;
  }): Promise<number>;

  getRemediationAttempts(desktopId: string): Promise<Array<{
    rule: string;
    policyVersion: string;
    attemptCount: number;
    lastAttemptAt: string | null;
    escalated: boolean;
    escalatedAt: string | null;
  }>>;

  // Remediation operations (VDI-4B): durable executor state.
  /** Atomic claim: exactly one winner among concurrent workers. Attempt
   *  budget consumed at admission. Losers get {claimed:false, status,…}. */
  claimRemediationOperation(args: {
    operationKey: string;
    tenantId: string;
    workspaceId: string;
    desktopId: string;
    desktopGeneration: number;
    action: string;
    reason: string;
    proposal: Record<string, unknown>;
    policyVersion: string;
    proposedAt: string;
    expiresAt: string;
    workerId: string;
    attemptLimit: number;
    attemptRule: string;
  }): Promise<{ claimed: boolean; status: string; owner: string | null; attemptNumber: number | null }>;

  /** Owner-guarded status transition; terminal states immutable; stale
   *  workers (different worker_id) get false. */
  updateRemediationOperation(args: {
    operationKey: string;
    workerId: string;
    newStatus: 'dispatched' | 'success' | 'refused' | 'exhausted' | 'reconciling' | 'unresolved';
    outcomeEvidence?: Record<string, unknown> | null;
    refusalReason?: string | null;
  }): Promise<boolean>;

  getRemediationOperation(operationKey: string): Promise<{
    status: string;
    workerId: string | null;
    attemptNumber: number | null;
    outcomeEvidence: Record<string, unknown> | null;
    refusalReason: string | null;
  } | null>;

  // Budget admission (VDI-4C). Money: integer micro-USD (exact).
  /** Atomic admission: accounted + outstanding + requested <= limit.
   *  Idempotent by operation key (replay returns the original); conflicting
   *  binding refused. Unknown pricing needs a conservative ceiling. */
  admitReservation(args: {
    operationKey: string;
    tenantId: string;
    workspaceId: string;
    budgetPeriod: string;
    currency: string;
    /** null ⇒ pricing unknown (never zero). */
    amountMicros: number | null;
    unknownCeilingMicros: number | null;
    resourceSpec: Record<string, unknown>;
    pricingVersion: string;
    horizonExpiresAt: string;
  }): Promise<{ admitted: boolean; replay: boolean; reason?: string; amountMicros?: number; pricingKnown?: boolean; status?: string }>;

  /** 'uncertain' → held-for-reconciliation (retained; expiry alone never
   *  releases). 'failed' → released once. */
  resolveProvisioning(args: {
    operationKey: string;
    outcome: 'uncertain' | 'failed';
    now: string;
  }): Promise<{ ok: boolean; status?: string; reason?: string }>;

  /** Atomically replace reserved exposure with accounted spend; overruns
   *  recorded; policy may block further admission. Idempotent by amount. */
  settleReservation(args: {
    operationKey: string;
    actualMicros: number;
    blockAdmissionOnOverrun: boolean;
    now: string;
  }): Promise<{ ok: boolean; replay: boolean; settledMicros?: number; overrunRecorded?: number; reason?: string }>;

  /** Provider-charge adjustment on a settled entry (idempotent corrections;
   *  delta applied atomically; estimates never re-counted). */
  adjustSettledCharge(args: {
    operationKey: string;
    chargeMicros: number;
    now: string;
  }): Promise<{ ok: boolean; replay: boolean; deltaMicros?: number; reason?: string }>;

  /** Explicit horizon extension (never automatic). */
  extendReservationHorizon(args: {
    operationKey: string;
    newHorizon: string;
    now: string;
  }): Promise<boolean>;

  getBudget(args: {
    tenantId: string;
    workspaceId: string;
    budgetPeriod: string;
  }): Promise<{ limitMicros: number; accountedSpendMicros: number; overrunMicros: number; admissionBlocked: boolean } | null>;

  getReservation(operationKey: string): Promise<{
    status: string;
    amountMicros: number;
    budgetPeriod: string;
    pricingKnown: boolean;
    settledMicros: number | null;
    providerChargeAdjustmentsMicros: number;
    horizonExpiresAt: string;
    reconciling: boolean;
  } | null>;

  // Can Suspend
  canSuspendDesktop(desktopId: string, scope: TenantScope): Promise<boolean>;

  // Workspace Authorization
  validateWorkspaceMembership(userId: string, workspaceId: string): Promise<boolean>;
  validateWorkspaceOwnership(userId: string, workspaceId: string): Promise<boolean>;
}

// Export the Supabase implementation as default for production
export {
  createDesktop,
  getDesktopById,
  getDesktopByProviderId,
  updateDesktopPhase,
  updateDesktopResumeKey,
  listDesktops,
  grantSessionLease,
  revokeSessionLease,
  getActiveSessionLease,
  grantExecutionLease,
  revokeExecutionLease,
  getActiveExecutionLease,
  createConnectionGrant,
  revokeConnectionGrants,
  validateConnectionGrant,
  grantInputControlLease,
  revokeInputControlLease,
  getActiveInputControlLease,
  checkOperationKey,
  recordOperationKey,
  recordEvidence,
  canSuspendDesktop,
  validateWorkspaceMembership,
  validateWorkspaceOwnership,
} from './desktopStore';

// Export types
export type {
  VdiDesktopRow,
  VdiSessionLeaseRow,
  VdiExecutionLeaseRow,
  VdiConnectionGrantRow,
  VdiInputControlLeaseRow,
  VdiOperationKeyRow,
  VdiEvidenceRow,
} from './desktopStore';