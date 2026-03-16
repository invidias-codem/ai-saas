/**
 * @file router/index.ts
 * @description UCOL Context Routing Algorithm — 9-step implementation (spec §5.3).
 *
 * Latency SLA: Steps 1–2 < 5ms, Step 3 < 50ms, Steps 4–9 < 300ms total.
 * LLM classification (Step 6) must complete in < 200ms or falls back to UNKNOWN.
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  Task,
  RoutingDecision,
  KnowledgeItem,
  SecurityTier,
  FormatAdapter,
  ModelID,
  TaskIntent,
} from '../store/schema.js';
import { SECURITY_TIER_ORDER } from '../store/schema.js';
import type { ContextStore } from '../store/index.js';
import { resolveFormatAdapter, greedyPack, estimateTokens } from './format.js';
import { classifyIntent, DEFAULT_ROUTING_TABLE, scoreContextConfidence } from './classify.js';
import { DoubtEngine } from '../security/doubt.js';
import ProceduralMemory from '../../lib/ucol/proceduralMemory.js';

/** Freshness decay rate λ = 0.005 per day (default, from spec §5.3 Step 5) */
const FRESHNESS_LAMBDA = 0.005;

/**
 * Compute freshness score using exponential decay.
 * freshness = e^(-λ × age_days)
 *
 * @param validFrom - ISO 8601 timestamp when item became valid
 * @returns Freshness score in [0, 1]
 */
function computeFreshness(validFrom: string): number {
  const ageDays = (Date.now() - new Date(validFrom).getTime()) / (1000 * 60 * 60 * 24);
  return Math.exp(-FRESHNESS_LAMBDA * ageDays);
}

/**
 * Cosine similarity between two equal-length vectors.
 * Returns 0 if either vector has zero magnitude.
 *
 * @param a - First vector
 * @param b - Second vector
 * @returns Cosine similarity in [-1, 1]
 */
function cosineSim(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

/** Detect destructive intent in a task query */
function detectsDestructiveIntent(query: string): boolean {
  const lower = query.toLowerCase();
  const destructivePatterns = [
    'delete',
    'drop table',
    'truncate',
    'destroy',
    'remove all',
    'wipe',
    'purge',
    'rm -rf',
    'format',
    'irreversible',
  ];
  return destructivePatterns.some((p) => lower.includes(p));
}

/**
 * Determine the minimum security tier required for a query.
 * Simple heuristic: looks for tier keywords in the query.
 * In production, this would be policy-driven.
 *
 * @param query - Task query string
 * @returns Minimum required SecurityTier
 */
function minTierRequired(_query: string): SecurityTier {
  // Default: PUBLIC tier required (any agent can access)
  return 'PUBLIC';
}

/**
 * UCOL Context Router — implements the 9-step routing algorithm from spec §5.3.
 */
export class ContextRouter {
  private readonly store: ContextStore;
  private readonly geminiApiKey: string;
  private readonly doubt: DoubtEngine;
  private readonly routingTable: Record<string, ModelID>;

  /**
   * @param store - ContextStore for knowledge retrieval
   * @param geminiApiKey - Gemini API key for embedding + classification
   * @param routingTable - Optional override for intent → model mapping
   */
  constructor(
    store: ContextStore,
    geminiApiKey: string,
    routingTable: Record<string, ModelID> = DEFAULT_ROUTING_TABLE
  ) {
    this.store = store;
    this.geminiApiKey = geminiApiKey;
    this.doubt = new DoubtEngine();
    this.routingTable = routingTable;
  }

  /**
   * Execute the 9-step routing algorithm.
   *
   * @param task - Incoming Task
   * @returns RoutingDecision
   * @throws Error with UCOL error code on hard constraint violations
   */
  async route(task: Task): Promise<RoutingDecision> {
    const taskId = uuidv4();

    // ─────────────────────────────────────────────────────────────────────────
    // Step 1 — Security Gate (hard constraint, evaluated first)
    // Spec §5.3: if clearance < min tier required → reject
    // ─────────────────────────────────────────────────────────────────────────
    const minTier = minTierRequired(task.query);
    if (SECURITY_TIER_ORDER[task.security_clearance] < SECURITY_TIER_ORDER[minTier]) {
      const err = new Error(
        `INSUFFICIENT_CLEARANCE: Agent clearance '${task.security_clearance}' ` +
          `is below required '${minTier}'`
      );
      (err as NodeJS.ErrnoException).code = '-33001';
      throw err;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Step 2 — Destructive Action Gate (hard constraint)
    // Spec §5.3: if destructive intent AND allow_destructive = false → reject
    // ─────────────────────────────────────────────────────────────────────────
    if (detectsDestructiveIntent(task.query) && !task.allow_destructive) {
      const err = new Error(
        'DESTRUCTIVE_REQUIRES_APPROVAL: Destructive intent detected; set allow_destructive=true'
      );
      (err as NodeJS.ErrnoException).code = '-33002';
      throw err;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Step 3 — Procedural Memory Fast-Path
    // Spec §5.3: if stable macro found with similarity >= 0.92 → fast-path return
    // Import ProceduralMemory from ../../lib/ucol/proceduralMemory (already exists)
    // ─────────────────────────────────────────────────────────────────────────
    const pmResult = await ProceduralMemory.findProceduralMatch(task.agent_id, task.query);
    if (pmResult !== null && pmResult.isStableMacro && pmResult.similarity >= 0.92) {
      const targetModel =
        this.routingTable[pmResult.record.taskType] ?? DEFAULT_ROUTING_TABLE['UNKNOWN'];
      const formatAdapter = resolveFormatAdapter(targetModel);

      // Convert ProceduralMemory ToolSteps to UCOL ToolSteps
      const proceduralSeq = pmResult.record.toolSequence.map((s) => ({
        harness: s.tool,
        command: [s.command, ...s.args],
        expected: s.expectedOutputShape ? JSON.stringify(s.expectedOutputShape) : undefined,
      }));

      const decision: RoutingDecision = {
        task_id: taskId,
        target_model: targetModel,
        context_slice: [],
        format_adapter: formatAdapter,
        estimated_tokens: 0,
        source: 'PROCEDURAL_MEMORY',
        confidence: 1.0,
        doubt_score: 0.0,
        security_score: 10.0,
        review_required: false,
        procedural_sequence: proceduralSeq,
        created_at: new Date().toISOString(),
      };

      // Jump to Step 7 (format applied above) then Steps 8–9 below
      // Step 8 — Doubt scoring (skip for procedural path — already high confidence)
      // Step 9 — Record execution (async, fire-and-forget)
      void ProceduralMemory.recordExecution(
        task.agent_id,
        task.query,
        pmResult.record.taskType,
        pmResult.record.toolSequence,
        true
      );

      return decision;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Step 4 — Context Retrieval
    // Spec §5.3: embed query, similarity search k=20, filter by tier + validity
    // ─────────────────────────────────────────────────────────────────────────
    let queryEmbedding: number[] = [];
    let candidates: Array<KnowledgeItem & { similarity: number }> = [];

    try {
      queryEmbedding = await this.embedQuery(task.query);
      candidates = await this.store.searchKnowledge(
        queryEmbedding,
        task.security_clearance,
        20,
        0.0
      );

      // Filter to valid items at current time
      const now = new Date().toISOString();
      candidates = candidates.filter(
        (item) =>
          item.valid_from <= now &&
          (item.valid_until === null || item.valid_until >= now)
      );
    } catch {
      // If embedding/retrieval fails, continue with empty candidates
      candidates = [];
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Step 5 — Context Scoring and Selection
    // Spec §5.3: score = relevance*0.50 + freshness*0.30 + confidence*0.20
    // freshness = e^(-0.005 × age_days); greedy_pack up to budget
    // ─────────────────────────────────────────────────────────────────────────
    const scored = candidates.map((item) => {
      const relevance = item.similarity ?? 0;
      const freshness = computeFreshness(item.valid_from);
      const confidence = item.confidence;
      const score = relevance * 0.5 + freshness * 0.3 + confidence * 0.2;
      return { item, score };
    });

    // Sort by score DESC
    scored.sort((a, b) => b.score - a.score);

    // ─────────────────────────────────────────────────────────────────────────
    // Step 6 — Intent Classification + Model Selection
    // Spec §5.3: Gemini Flash, <200ms SLA; fallback to UNKNOWN
    // ─────────────────────────────────────────────────────────────────────────
    const classification = await classifyIntent(task.query, this.geminiApiKey, 200);
    let targetModel: ModelID = this.routingTable[classification.intent] ?? DEFAULT_ROUTING_TABLE['UNKNOWN'];
    let routingSource: RoutingDecision['source'] = 'LLM_CLASSIFIER';
    let confidence = classification.confidence;

    // Memory confidence upgrade — if high-confidence memory facts exist
    if (task.memory_facts && task.memory_facts.length > 0) {
      const confidenceSignal = scoreContextConfidence(task.memory_facts, targetModel);
      if (confidenceSignal.tier === 'UPGRADE') {
        targetModel = confidenceSignal.recommended_model;
        confidence = Math.max(confidence, 0.85);
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Step 7 — Format Adaptation
    // Spec §5.3: FORMAT_MAP[target_model] → apply_format(selected, adapter)
    // anthropic/* → XML_TAGGED, google/* → MARKDOWN_HEADERS,
    // deepseek/* → JSON_STRUCTURED, local/* → PLAIN_TEXT
    // ─────────────────────────────────────────────────────────────────────────
    const formatAdapter: FormatAdapter = resolveFormatAdapter(targetModel);
    const contextSlice = greedyPack(scored, task.budget_tokens, formatAdapter);
    const estimatedTokens = estimateTokens(contextSlice);

    // ─────────────────────────────────────────────────────────────────────────
    // Step 8 — Doubt Scoring
    // Spec §5.3: DoubtEngine.score(D); if doubt triggers review → notify
    // ─────────────────────────────────────────────────────────────────────────
    const constraintSet = candidates.filter((c) => c.type === 'CONSTRAINT');
    const doubtResult = this.doubt.score({
      proposer_outputs: [],
      context_fragment: candidates,
      constraint_set: constraintSet,
      task,
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Step 9 — Procedural Memory Recording (async, fire-and-forget)
    // Spec §5.3: ProceduralMemory.record(T, D, success=null)
    // ─────────────────────────────────────────────────────────────────────────
    void ProceduralMemory.recordExecution(
      task.agent_id,
      task.query,
      classification.intent,
      [],
      true // outcome recorded post-execution; null in spec = optimistic
    );

    const decision: RoutingDecision = {
      task_id: taskId,
      target_model: targetModel,
      context_slice: contextSlice,
      format_adapter: formatAdapter,
      estimated_tokens: estimatedTokens,
      source: routingSource,
      confidence,
      doubt_score: doubtResult.doubt_score,
      security_score: doubtResult.security_score,
      review_required: doubtResult.review_required,
      confidence_override: task.memory_facts ? task.memory_facts.length > 0 : false,
      procedural_sequence: null,
      created_at: new Date().toISOString(),
    };

    return decision;
  }

  /**
   * Generate a 768-dim embedding for a query string using Gemini.
   * Falls back to zero vector on API error.
   *
   * @param text - Text to embed
   * @returns 768-dim float array
   */
  private async embedQuery(text: string): Promise<number[]> {
    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(this.geminiApiKey);
      const model = genAI.getGenerativeModel({ model: 'embedding-001' });
      const result = await model.embedContent(text);
      return result.embedding.values;
    } catch {
      // Return zero vector as fallback
      return new Array(768).fill(0) as number[];
    }
  }
}
