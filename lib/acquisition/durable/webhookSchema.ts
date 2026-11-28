// lib/acquisition/durable/webhookSchema.ts
// Minimal terminal-event webhook schema. The webhook is a WAKE-UP, never
// authoritative state — the worker re-reads the provider API. datasetId
// here is correlation evidence only.

import { z } from 'zod';

export const ApifyTerminalWebhookSchema = z.object({
  eventType: z.enum([
    'ACTOR.RUN.SUCCEEDED',
    'ACTOR.RUN.FAILED',
    'ACTOR.RUN.TIMED_OUT',
    'ACTOR.RUN.ABORTED',
  ]),
  actorRunId: z.string().min(1),
  actorId: z.string().optional(),
  datasetId: z.string().optional(),
  // Apify webhook payloads carry createdAt; tolerate-and-ignore extras.
  createdAt: z.string().optional(),
});

export type ApifyTerminalWebhook = z.infer<typeof ApifyTerminalWebhookSchema>;

/** Nonterminal/unknown events are dropped WITHOUT ingestion — by contract. */
export function isTerminalWebhookEvent(eventType: string): boolean {
  return (
    eventType === 'ACTOR.RUN.SUCCEEDED' ||
    eventType === 'ACTOR.RUN.FAILED' ||
    eventType === 'ACTOR.RUN.TIMED_OUT' ||
    eventType === 'ACTOR.RUN.ABORTED'
  );
}
