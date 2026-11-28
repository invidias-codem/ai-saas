// src/trigger/acquisitionIngestTask.ts
// A3: durable acquisition ingestion. Thin shell over the deterministic
// runIngestion state machine — no Threads knowledge, no normalization, no
// LLM calls, no EvidenceObjectV1. Payload = durable identities ONLY.
//
// The production ApifyBoundary uses the official client; the state machine
// remains contract-tested with fixture dependencies and no paid runs.

import { task } from "@trigger.dev/sdk";
import { z } from "zod";
import { runIngestion } from "@/lib/acquisition/durable/ingestion";
import { ApifyAcquisitionProvider, type ProviderClock } from "@/lib/acquisition/providers/apify/provider";
import { getProductionRegistry } from "@/lib/acquisition/providers/apify/actorRegistry";
import * as store from "@/lib/acquisition/store/acquisitionStore";
import { runNormalization } from "@/lib/acquisition/durable/normalization";
import { logEvent } from "@/lib/telemetry";
import { env } from "@/lib/env";

export const acquisitionIngestPayloadSchema = z.object({
  acquisitionRequestId: z.string().min(1),
  provider: z.literal("apify"),
  providerRunId: z.string().min(1),
  operationKey: z.string().min(1),
});

/**
 * A4: production ApifyBoundary wired to official apify-client.
 * Replaces the A3 stub boundary (which threw "lands in A4").
 */
import { productionApifyBoundary } from '@/lib/acquisition/providers/apify/client';

export function buildProductionProvider(): ApifyAcquisitionProvider {
  const clock: ProviderClock = { now: () => new Date().toISOString() };
  return new ApifyAcquisitionProvider(
    productionApifyBoundary,
    clock,
    getProductionRegistry(), // A4: Threads actor enabled
    env.APIFY_API_TOKEN
  );
}

export const acquisitionIngestTask = task({
  id: "acquisition-ingest",
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 60000,
  },
  run: async (payload: z.infer<typeof acquisitionIngestPayloadSchema>) => {
    const provider = buildProductionProvider();

    const outcome = await runIngestion({
      deps: {
        provider,
        store,
        clock: { now: () => new Date().toISOString() },
        onBudgetViolation: ({ providerRunId, finalCostUsd, authorizedUsd }) => {
          // Governance violation: telemetry. Evidence is NEVER deleted.
          logEvent({
            eventType: "decision_canary_event",
            metadata: {
              note: "acquisition_budget_violation",
              providerRunId,
              finalCostUsd,
              authorizedUsd,
            },
          });
        },
      },
      providerName: payload.provider,
      providerRunId: payload.providerRunId,
      operationKey: payload.operationKey,
    });

    // A4 (issue #417): the `normalizing` → `completed` transition. Runs on
    // completed AND budget_violation — a cost violation is a governance
    // signal, never a reason to drop already-collected evidence.
    if (outcome.kind === "completed" || outcome.kind === "budget_violation") {
      const normalization = await runNormalization({
        store,
        provider: payload.provider,
        providerRunId: payload.providerRunId,
        now: new Date().toISOString(),
      });
      return { outcome, normalization };
    }

    return { outcome };
  },
});
