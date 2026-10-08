// src/trigger/acquisitionIngestTask.ts
// A3: durable acquisition ingestion. Thin shell over the deterministic
// runIngestion state machine — no Threads knowledge, no normalization, no
// LLM calls, no EvidenceObjectV1. Payload = durable identities ONLY.
//
// The production ApifyBoundary (apify-client wiring) lands in A4 with the
// first real actor — the same slice that first dispatches this task (empty
// registry ⇒ no runs ⇒ no webhooks before then). The state machine below
// is fully contract-tested with fixture deps.

import { task } from "@trigger.dev/sdk";
import { z } from "zod";
import { runIngestion } from "@/lib/acquisition/durable/ingestion";
import { ApifyAcquisitionProvider, type ApifyBoundary, type ProviderClock } from "@/lib/acquisition/providers/apify/provider";
import * as store from "@/lib/acquisition/store/acquisitionStore";
import { logEvent } from "@/lib/telemetry";
import { env } from "@/lib/env";

export const acquisitionIngestPayloadSchema = z.object({
  acquisitionRequestId: z.string().min(1),
  provider: z.literal("apify"),
  providerRunId: z.string().min(1),
  operationKey: z.string().min(1),
});

/**
 * ponytail: the concrete production ApifyBoundary is A4 scope — it first
 * has a caller there. Until A4 registers an actor, this task can never be
 * dispatched in production (empty registry ⇒ no runs ⇒ no terminal
 * webhooks). The exported factory keeps A4's wiring to one call.
 */
export function buildProductionProvider(): ApifyAcquisitionProvider {
  // A4 replaces this stub boundary with the apify-client implementation
  // (client.ts). Import is by type only here.
  const boundary: ApifyBoundary = {
    actorPricing: async () => {
      throw new Error("apify production boundary lands in A4");
    },
    startRun: async () => {
      throw new Error("apify production boundary lands in A4");
    },
    getRun: async () => {
      throw new Error("apify production boundary lands in A4");
    },
    listDatasetItems: async () => {
      throw new Error("apify production boundary lands in A4");
    },
    abortRun: async () => {
      throw new Error("apify production boundary lands in A4");
    },
  };
  const clock: ProviderClock = { now: () => new Date().toISOString() };
  return new ApifyAcquisitionProvider(boundary, clock, undefined, env.APIFY_API_TOKEN);
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

    return { outcome };
  },
});
