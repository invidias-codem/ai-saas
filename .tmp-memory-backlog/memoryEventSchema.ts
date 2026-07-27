// lib/memory/memoryEventSchema.ts

import { z } from 'zod';

export const ToolInvocationSchema: z.ZodType<ToolInvocation> = z.object({
  toolId: z.string().min(1).max(120),
  toolName: z.string().min(1).max(240),
  status: z.enum(['success', 'failure', 'skipped']),
  latencyMs: z.number().finite(),
  argsHash: z.string().min(1).max(240),
  outputSummary: z.string().max(500).optional(),
});

export const ModelDecisionSchema: z.ZodType<ModelDecision> = z.object({
  requestedModel: z.string().min(1).max(240),
  routedModel: z.string().min(1).max(240),
  routeReason: z.string().max(500).optional(),
  fallbackUsed: z.boolean(),
  provider: z.string().min(1).max(240),
});

export const MemoryEventSchema: z.ZodType<MemoryEvent> = z.object({
  id: z.string().uuid().optional(),
  workspaceId: z.string().uuid().nullable().optional(),
  userId: z.string().uuid().optional(),
  sessionId: z.string().uuid().optional(),
  source: z.enum(['siri', 'genie', 'system']),
  entityRefs: z.array(z.string()).max(100).optional(),
  toolInvocations: z.array(ToolInvocationSchema).max(20).optional(),
  modelDecision: ModelDecisionSchema.optional(),
  promptHash: z.string().max(240).optional(),
  resultSummary: z.string().max(1000).optional(),
  latencyMs: z.number().finite().nonnegative(),
  tokensIn: z.number().finite().nonnegative(),
  tokensOut: z.number().finite().nonnegative(),
  costEstimate: z.number().finite().nullable().optional(),
  confidence: z.number().finite().min(0).max(1).nullable().optional(),
  createdAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/).optional(),
  validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/).optional(),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/).optional(),
});

export type ToolInvocation = {
  toolId: string;
  toolName: string;
  status: 'success' | 'failure' | 'skipped';
  latencyMs: number;
  argsHash: string;
  outputSummary?: string;
};
export type ModelDecision = {
  requestedModel: string;
  routedModel: string;
  routeReason?: string;
  fallbackUsed: boolean;
  provider: string;
};
export type MemoryEvent = z.infer<typeof MemoryEventSchema>;
