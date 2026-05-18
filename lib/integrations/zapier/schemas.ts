import { z } from 'zod';

export const zapierMemoryPolicySchema = z.object({
  mode: z.enum(['none', 'store', 'retrieve', 'store_and_retrieve']).default('store'),
  scope: z.enum(['conversation', 'workspace']).default('workspace'),
  importance: z.enum(['low', 'normal', 'high']).default('normal'),
  allowPromotion: z.boolean().default(false),
  dedupKey: z.string().nullable().optional(),
});

export const zapierRoutingPolicySchema = z.object({
  mode: z.enum(['default', 'fast', 'quality', 'extraction', 'reasoning']).default('default'),
  latencySensitivity: z.enum(['low', 'normal', 'high']).default('normal'),
  costSensitivity: z.enum(['low', 'normal', 'high']).default('normal'),
  preferredProvider: z.string().nullable().optional(),
  allowFallback: z.boolean().default(true),
});

export const zapierMetadataSchema = z.record(z.string(), z.unknown()).default({});

export const zapierBaseEnvelopeSchema = z.object({
  workspaceId: z.string().min(1),
  operatingProfileId: z.string().nullable().optional(),
  sourceApp: z.string().min(1),
  sourceEntityType: z.string().min(1),
  sourceEntityId: z.string().min(1),
  sourceUrl: z.string().url().nullable().optional(),
  userVisibleTitle: z.string().nullable().optional(),
  memoryPolicy: zapierMemoryPolicySchema.optional(),
  routingPolicy: zapierRoutingPolicySchema.optional(),
  metadata: zapierMetadataSchema.optional(),
});

export const zapierSaveMemoryRequestSchema = zapierBaseEnvelopeSchema.extend({
  payload: z.object({
    content: z.string().min(1).max(20000),
    memoryType: z.enum(['fact', 'conversation_summary', 'preference']).default('fact'),
    tags: z.array(z.string().min(1)).max(20).optional(),
  }),
});

export const zapierRetrieveContextRequestSchema = zapierBaseEnvelopeSchema.extend({
  payload: z.object({
    query: z.string().min(1).max(5000),
    maxResults: z.number().int().min(1).max(10).default(5),
  }),
});

export const zapierExtractFactsRequestSchema = zapierBaseEnvelopeSchema.extend({
  payload: z.object({
    text: z.string().min(1).max(20000),
    schemaHint: z.string().nullable().optional(),
  }),
});

export const zapierErrorResponseSchema = z.object({
  success: z.literal(false),
  operation: z.string(),
  workspaceId: z.string().nullable(),
  trace: z.object({
    requestId: z.string(),
    timestamp: z.string(),
  }),
  error: z.object({
    code: z.string(),
    message: z.string(),
    retryable: z.boolean(),
  }),
  warnings: z.array(z.string()),
});

export const zapierSuccessResponseSchema = z.object({
  success: z.literal(true),
  operation: z.string(),
  workspaceId: z.string(),
  trace: z.object({
    requestId: z.string(),
    timestamp: z.string(),
  }),
  result: z.record(z.string(), z.unknown()),
  warnings: z.array(z.string()),
});

export type ZapierMemoryPolicyInput = z.infer<typeof zapierMemoryPolicySchema>;
export type ZapierRoutingPolicyInput = z.infer<typeof zapierRoutingPolicySchema>;
export type ZapierBaseEnvelopeInput = z.infer<typeof zapierBaseEnvelopeSchema>;
export type ZapierSaveMemoryRequest = z.infer<typeof zapierSaveMemoryRequestSchema>;
export type ZapierRetrieveContextRequest = z.infer<typeof zapierRetrieveContextRequestSchema>;
export type ZapierExtractFactsRequest = z.infer<typeof zapierExtractFactsRequestSchema>;
