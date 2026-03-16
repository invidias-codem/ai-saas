/**
 * Unit tests for src/security/doubt.ts
 * Conformance: CONF-050, CONF-051, CONF-052
 */

import { describe, it, expect } from '@jest/globals';
import { DoubtEngine } from '../../src/security/doubt.js';
import type { DoubtInput, KnowledgeItem, Task } from '../../src/store/schema.js';

function makeConstraint(content: string): KnowledgeItem {
  return {
    id: `c-${Math.random().toString(36).slice(2)}`,
    content,
    type: 'CONSTRAINT',
    confidence: 0.99,
    source: 'did:ucol:operator',
    valid_from: new Date().toISOString(),
    valid_until: null,
    provenance: 'test',
    signature: 'test',
    embedding: null,
    security_tier: 'INTERNAL',
  };
}

function makeKItem(confidence: number): KnowledgeItem {
  return {
    id: `k-${Math.random().toString(36).slice(2)}`,
    content: 'some knowledge fact',
    type: 'FACT',
    confidence,
    source: 'did:ucol:agent',
    valid_from: new Date().toISOString(),
    valid_until: null,
    provenance: 'test',
    signature: 'test',
    embedding: null,
    security_tier: 'INTERNAL',
  };
}

function makeTask(query = 'test query'): Task {
  return {
    query,
    agent_id: 'did:ucol:test-agent',
    session_id: 'sess-001',
    budget_tokens: 4000,
    max_latency_ms: 500,
    security_clearance: 'INTERNAL',
    allow_destructive: false,
  };
}

describe('Doubt Engine — AUTO_APPROVE (CONF-050)', () => {
  it('produces AUTO_APPROVE when outputs identical, no violations, reliable matching context', () => {
    const engine = new DoubtEngine();
    // Context content must match task.query for relevance to be non-zero
    const matchingItem = {
      ...makeKItem(1.0),
      content: 'middleware authentication structure pattern design',
    };
    const input: DoubtInput = {
      proposer_outputs: ['Output A', 'Output A'],  // identical → cv = 0
      context_fragment: [matchingItem],
      constraint_set: [],
      task: makeTask('authentication middleware structure'),  // query matches context
    };

    const result = engine.score(input);
    // Doubt_Score = 0*0.5 + 0*0.35 + (1-1.0)*0.15 = 0
    // relevance is non-zero (matching bigrams), verification=1.0, score = relevance / 0.01 >> 8
    expect(result.doubt_score).toBeCloseTo(0, 4);
    expect(result.security_score).toBeGreaterThanOrEqual(8.0);
    expect(result.review_required).toBe(false);
    expect(result.action).toBe('AUTO_APPROVE');
  });
});

describe('Doubt Engine — HUMAN_REVIEW (CONF-051)', () => {
  it('triggers HUMAN_REVIEW with max disagreement + constraint violation + low confidence', () => {
    const engine = new DoubtEngine();
    const input: DoubtInput = {
      proposer_outputs: [
        'Use synchronous blocking I/O for all database operations',
        'Never use sync I/O. All DB calls must be non-blocking async with proper error boundaries.',
      ],
      context_fragment: [makeKItem(0.3)],
      constraint_set: [makeConstraint('All database calls must be async')],
      task: makeTask('database implementation strategy'),
    };

    const result = engine.score(input);
    expect(result.constraint_violation_flag).toBe(1.0);
    expect(result.doubt_score).toBeGreaterThan(0.3);
    expect(result.security_score).toBeLessThan(4.0);
    expect(result.review_required).toBe(true);
    expect(result.action).toBe('HUMAN_REVIEW');
  });
});

describe('Doubt Engine — Constraint Violation (CONF-052)', () => {
  it('sets constraint_violation_flag=1.0 when output contains negation + constraint keyword', () => {
    const engine = new DoubtEngine();
    // outputContradicts checks: keyword hit (word > 4 chars from constraint) + negation in output
    // Constraint: "Never log passwords directly"  → keywords: "never", "passw", "direc"
    // Output: "It's not necessary to avoid logging passwords here"
    //   → keyword "passw" hit + negation "not" present → contradiction detected
    const input: DoubtInput = {
      proposer_outputs: ["It's not necessary to avoid logging passwords in this context"],
      context_fragment: [],
      constraint_set: [makeConstraint('Never log passwords directly in application logs')],
      task: makeTask(),
    };
    const result = engine.score(input);
    expect(result.constraint_violation_flag).toBe(1.0);
  });

  it('sets constraint_violation_flag=0.0 when no constraint is violated', () => {
    const engine = new DoubtEngine();
    const input: DoubtInput = {
      proposer_outputs: ['Use Array.map() for data transformation'],
      context_fragment: [],
      constraint_set: [makeConstraint('Never use eval() in code')],
      task: makeTask(),
    };
    const result = engine.score(input);
    expect(result.constraint_violation_flag).toBe(0.0);
  });
});

describe('Doubt Engine — Formula and Thresholds', () => {
  it('doubt_score is in [0, 1]', () => {
    const engine = new DoubtEngine();
    const result = engine.score({
      proposer_outputs: [],
      context_fragment: [],
      constraint_set: [],
      task: makeTask(),
    });
    expect(result.doubt_score).toBeGreaterThanOrEqual(0);
    expect(result.doubt_score).toBeLessThanOrEqual(1);
  });

  it('security_score is finite and non-negative', () => {
    const engine = new DoubtEngine();
    const result = engine.score({
      proposer_outputs: [],
      context_fragment: [],
      constraint_set: [],
      task: makeTask(),
    });
    expect(isFinite(result.security_score)).toBe(true);
    expect(result.security_score).toBeGreaterThanOrEqual(0);
  });

  it('single proposer output results in zero confidence_variance', () => {
    const engine = new DoubtEngine();
    const result = engine.score({
      proposer_outputs: ['Only one output'],
      context_fragment: [makeKItem(1.0)],
      constraint_set: [],
      task: makeTask(),
    });
    expect(result.confidence_variance).toBe(0.0);
  });

  it('action field is consistent with security_score thresholds', () => {
    const engine = new DoubtEngine();
    const result = engine.score({
      proposer_outputs: [],
      context_fragment: [],
      constraint_set: [],
      task: makeTask(),
    });
    if (result.security_score >= 8.0) expect(result.action).toBe('AUTO_APPROVE');
    else if (result.security_score >= 4.0) expect(result.action).toBe('PROCEED_WITH_LOG');
    else expect(result.action).toBe('HUMAN_REVIEW');
  });
});
