/**
 * Unit/integration tests for memory event schema and normalization helpers.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { MemoryEventSchema, ToolInvocationSchema, ModelDecisionSchema } from '@/lib/memory/memoryEventSchema';
import {
  maxToolInvocations,
  maxMemoryEventBodyLength,
  normalizeToolInvocations,
  sanitizeModelDecision,
  sanitizeEventBody,
} from '@/app/api/memory/events/route';

describe('memoryEventSchema', () => {
  test('rejects invalid tool status', () => {
    expect(() => ToolInvocationSchema.parse({ toolId: 't', toolName: 'n', status: 'unknown', latencyMs: 1, argsHash: 'a' })).toThrow();
  });

  test('accepts valid model decision', () => {
    expect(ModelDecisionSchema.parse({ requestedModel: 'a', routedModel: 'b', fallbackUsed: false, provider: 'p' })).toBeTruthy();
  });
});

describe('memory event normalization', () => {
  test('truncates long result summaries', () => {
    const longText = 'x'.repeat(maxResultSummaryLength + 20);
    expect(sanitizeEventBody(longText).length).toBeLessThanOrEqual(maxResultSummaryLength + 3);
  });

  test('preserves short result summaries', () => {
    expect(sanitizeEventBody('short')).toBe('short');
  });

  test('normalizes valid tool invocations', () => {
    const tools = [
      { toolId: 't', toolName: 'name', status: 'success', latencyMs: 1, argsHash: 'a', outputSummary: 'output' },
      { toolId: 't', toolName: 'name', status: 'unknown', latencyMs: 'not-a-number', argsHash: '' },
    ];

    const normalized = normalizeToolInvocations(tools) as any[];
    expect(normalized[0].status).toBe('success');
    expect(normalized[0].outputSummary).toBe('output');
    expect(normalized[1].status).toBe('skipped');
    expect(normalized[1].latencyMs).toBe(0);
    expect(normalized.length).toBe(2);
  });

  test('drops excess tool invocations beyond maxToolInvocations', () => {
    const tools = Array.from({ length: maxToolInvocations + 5 }, () => ({
      toolId: 't',
      toolName: 'n',
      status: 'success',
      latencyMs: 1,
      argsHash: 'a',
    }));

    expect(normalizeToolInvocations(tools).length).toBe(maxToolInvocations);
  });

  test('normalizes model decision defaults', () => {
    expect(sanitizeModelDecision(null)).toBeUndefined();
    expect(sanitizeModelDecision({ requestedModel: 'a', routedModel: 'b', fallbackUsed: false, provider: 'p' })).toEqual({
      requestedModel: 'a',
      routedModel: 'b',
      fallbackUsed: false,
      provider: 'p',
    });
  });
});

describe('memory ingest helpers', () => {
  test('rejects invalid memory event shape', () => {
    expect(() => MemoryEventSchema.parse({ source: 'unknown', latencyMs: 1, tokensIn: 1, tokensOut: 1 })).toThrow();
  });
});
