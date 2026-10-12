// lib/vdi/fleet/usageAccountant.ts
// VDI-3C: usage accounting — idempotent per resource+interval.
//
// Invariants:
//   - Replayed intervals never double-count (store-enforced idempotency).
//   - Record source, covered interval, completeness. A current observation
//     alone cannot establish historical runtime: intervals split at lifecycle
//     transitions and gaps are marked explicitly.
//   - Cost presentation: measured usage (runtime_seconds), estimated cost
//     (rate + version pinned per record) and provider-reported charges are
//     SEPARATE fields. Unavailable pricing stays unknown (null), never zero.

import type { TenantScope } from '@/lib/intelligence/execution/vdi/contracts';
import type { DesktopStore } from '@/lib/vdi/store/desktopStoreInterface';

export interface UsageRate {
  /** USD per second of runtime. Pinned per record via rateVersion. */
  usdPerSecond: number;
  /** e.g. 'daytona-2026-10' — estimates keep their rate/version. */
  rateVersion: string;
}

export interface IntervalAccountantResult {
  recorded: number;
  skippedDuplicates: number;
}

export class UsageAccountant {
  constructor(
    private readonly store: DesktopStore,
    private readonly rate: UsageRate | null, // null ⇒ estimates unknown, never zero
  ) {}

  /**
   * Account the interval [start, end] for one resource. Idempotent: the
   * same (providerId, start, end) can be replayed safely.
   * phaseAtStart/phaseAtEnd let intervals SPLIT at lifecycle transitions;
   * completeness + gapReason make observation gaps explicit.
   */
  async recordInterval(args: {
    scope: TenantScope;
    desktopId: string;
    providerId: string;
    intervalStart: string;
    intervalEnd: string;
    phaseAtStart: string;
    phaseAtEnd: string | null;
    completeness: 'complete' | 'partial' | 'gap';
    gapReason?: string | null;
    source: 'observation' | 'provider_api';
    runtimeSeconds: number | null;
    providerReportedCostUsd?: number | null;
  }): Promise<IntervalAccountantResult> {
    const existing = await this.store.getUsageRecord(args.providerId, args.intervalStart, args.intervalEnd);
    if (existing) return { recorded: 0, skippedDuplicates: 1 };

    // Estimated cost = measured runtime × pinned rate. No rate ⇒ unknown.
    const runtime = args.runtimeSeconds && args.runtimeSeconds > 0
      ? (args.providerReportedCostUsd === null ? args.runtimeSeconds : args.runtimeSeconds)
      : args.runtimeSeconds;
    const estimated = this.rate && runtime !== null && runtime > 0
      ? Number((runtime * this.rate.usdPerSecond).toFixed(6))
      : null;

    await this.store.recordUsage({
      tenantId: args.scope.tenantId,
      workspaceId: args.scope.workspaceId,
      desktopId: args.desktopId,
      providerId: args.providerId,
      intervalStart: args.intervalStart,
      intervalEnd: args.intervalEnd,
      phaseAtStart: args.phaseAtStart,
      phaseAtEnd: args.phaseAtEnd,
      completeness: args.completeness,
      gapReason: args.gapReason ?? null,
      source: args.source,
      runtimeSeconds: runtime,
      estimatedCostUsd: estimated,
      estimateRateVersion: estimated !== null ? this.rate!.rateVersion : null,
      providerReportedCostUsd: args.providerReportedCostUsd ?? null,
    });
    return { recorded: 1, skippedDuplicates: 0 };
  }

  /**
   * Summarize usage for a workspace. Returns measured usage and estimated
   * cost separately; provider-reported charges when present. Gaps are
   * surfaced so outage periods never read as billable-complete history.
   */
  async summarize(scope: TenantScope): Promise<{
    totalRuntimeSeconds: number;
    totalEstimatedCostUsd: number | null;   // null = pricing unavailable
    totalProviderReportedCostUsd: number | null;
    intervalCount: number;
    gapCount: number;
    gapSeconds: number | null;
  }> {
    const records = await this.store.listUsage(scope);
    let runtime = 0;
    let estimated: number | null = null;
    let reported: number | null = null;
    let gaps = 0;
    for (const r of records) {
      if (r.completeness === 'gap') {
        gaps++;
        continue; // gaps are not measured usage
      }
      runtime += r.runtimeSeconds ?? 0;
      if (r.estimatedCostUsd !== null) estimated = (estimated ?? 0) + r.estimatedCostUsd;
      if (r.providerReportedCostUsd !== null) reported = (reported ?? 0) + r.providerReportedCostUsd;
    }
    return {
      totalRuntimeSeconds: runtime,
      totalEstimatedCostUsd: estimated,
      totalProviderReportedCostUsd: reported,
      intervalCount: records.length,
      gapCount: gaps,
      gapSeconds: null,
    };
  }
}
