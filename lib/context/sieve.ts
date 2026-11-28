// lib/context/sieve.ts
// Slice 6A: SHADOW context sieve. PURE core — no I/O, no wall-clock, no RNG.
//
// Invariant (contract-locked): the sieve may DEFER context; it may never
// DESTROY context. Blocks are a request-scoped PROJECTION over
// PreparedContextBundle.raw — the bundle, memory store, graph, facts, and
// documents are never modified. In shadow mode the production prompt is
// byte-identical; the sieve only records what it WOULD defer.
//
// Authority semantics (asymmetric, from Winnow's shape — numbers are NOT
// production truth until calibrated):
//   strong evidence irrelevant  → DEFER
//   uncertain                   → KEEP
//   strong evidence relevant    → KEEP
//   missing judgment            → KEEP
//   transport failure           → KEEP
//   error evidence present      → KEEP_ALL
// Default failure mode is KEEP_ALL, never PRUNE_ALL.
//
// Constitution rule: deterministic facts outrank semantic judgment —
// protected context can never be deferred, no matter what a model says.

export const SIEVE_GATE_VERSION = 'context-sieve-shadow-v1';
export const SIEVE_QUESTION_SET_VERSION = 1;
export const SIEVE_POLICY_VERSION = '1';

export type ContextDisposition = 'active' | 'deferred';

export type ContextBlockSource =
  | 'fact'
  | 'memory'
  | 'workspace_memory'
  | 'graph'
  | 'research'
  | 'profile'
  | 'document'
  | 'strategy';

export interface ContextBlock {
  id: string;
  source: ContextBlockSource;
  text: string;
  sourceRef?: string;
  estimatedTokens: number;
  protected: boolean;
  metadata: Record<string, unknown>;
}

export interface SieveDecision {
  blockId: string;
  disposition: ContextDisposition;
  relevance?: number;
  reasonCode: string;
}

export interface SieveJudgments {
  /** blockId → relevance score in [0,1]. Missing = no judgment = KEEP. */
  relevanceByBlock: Record<string, number>;
  /** Transport outcome — any non-ok → KEEP_ALL. */
  transportStatus: 'ok' | 'unavailable' | 'malformed';
}

export interface SievedContext {
  active: ContextBlock[];
  deferred: ContextBlock[];
  decisions: SieveDecision[];
  originalBlockCount: number;
  originalTokens: number;
  activeTokens: number;
  deferredTokens: number;
  transportAvailable: boolean;
}

/** Defer threshold — the ONLY knob. Conservative by design; freeze from
 *  calibration evidence before 6B, never invent. */
export const SIEVE_DEFER_THRESHOLD = 0.25;

export function estimateBlockTokens(text: string): number {
  // Same heuristic as the packer (chars/4) so counts reconcile.
  return Math.ceil((text || '').length / 4);
}

/**
 * Build atomic blocks from the prepared bundle's raw retrievals. Each fact /
 * research result / graph node / memory source becomes ONE block — a single
 * relevance number must never stand in for five unrelated memories inside
 * one big formatted string.
 * PROJECTION ONLY: reads the bundle, never mutates it.
 */
export function buildContextBlocks(input: {
  requestId: string;
  raw: {
    intelligentFacts?: readonly unknown[];
    researchResults?: readonly unknown[];
    graphRelatedNodes?: readonly unknown[];
    userProfileMemories?: readonly unknown[] | null;
    memorySources?: readonly unknown[];
  };
  sections: {
    attachedDocumentContext?: string;
    strategyContext?: string;
  };
  /** User-attached documents are PROTECTED — Constitution floor. */
  hasAttachments: boolean;
}): ContextBlock[] {
  const blocks: ContextBlock[] = [];
  const rid = input.requestId;

  const fact = (i: number, obj: Record<string, unknown>, key: string): string => `${rid}:fact:${i}:${String(obj[key] ?? '')}`;
  (input.raw.intelligentFacts ?? []).forEach((f, i) => {
    const o = f as Record<string, unknown>;
    blocks.push({
      id: fact(i, o, 'id'),
      source: 'fact',
      text: String(o.content ?? o.text ?? o.fact ?? ''),
      sourceRef: o.id ? String(o.id) : undefined,
      estimatedTokens: estimateBlockTokens(String(o.content ?? o.text ?? o.fact ?? '')),
      protected: false,
      metadata: { index: i, confidence: o.confidence ?? null },
    });
  });

  (input.raw.researchResults ?? []).forEach((r, i) => {
    const o = r as Record<string, unknown>;
    const text = String(o.content ?? o.snippet ?? o.summary ?? o.text ?? '');
    blocks.push({
      id: `${rid}:research:${i}`,
      source: 'research',
      text,
      sourceRef: o.url ? String(o.url) : undefined,
      estimatedTokens: estimateBlockTokens(text),
      protected: false,
      metadata: { index: i },
    });
  });

  (input.raw.graphRelatedNodes ?? []).forEach((n, i) => {
    const o = n as Record<string, unknown>;
    const text = String(o.name ?? o.label ?? o.type ?? '');
    const detail = o.summary ? ` — ${String(o.summary)}` : '';
    blocks.push({
      id: `${rid}:graph:${i}:${text}`,
      source: 'graph',
      text: text + detail,
      sourceRef: o.id ? String(o.id) : undefined,
      estimatedTokens: estimateBlockTokens(text + detail),
      protected: false,
      metadata: { index: i },
    });
  });

  (input.raw.userProfileMemories ?? []).forEach((m, i) => {
    const o = m as Record<string, unknown>;
    const text = String(o.content ?? o.memory ?? o.text ?? '');
    blocks.push({
      id: `${rid}:profile:${i}`,
      source: 'profile',
      text,
      sourceRef: o.id ? String(o.id) : undefined,
      estimatedTokens: estimateBlockTokens(text),
      protected: false,
      metadata: { index: i },
    });
  });

  (input.raw.memorySources ?? []).forEach((s, i) => {
    const o = s as Record<string, unknown>;
    const text = String(o.content ?? o.text ?? o.snippet ?? '');
    blocks.push({
      id: `${rid}:memory:${i}`,
      source: 'memory',
      text,
      sourceRef: o.id ? String(o.id) : undefined,
      estimatedTokens: estimateBlockTokens(text),
      protected: false,
      metadata: { index: i, scope: (o as { scope?: string }).scope ?? null },
    });
  });

  // Attached documents: PROTECTED. Semantic relevance never gets authority
  // over user-provided material.
  if (input.sections.attachedDocumentContext) {
    blocks.push({
      id: `${rid}:document:primary`,
      source: 'document',
      text: input.sections.attachedDocumentContext,
      estimatedTokens: estimateBlockTokens(input.sections.attachedDocumentContext),
      protected: true,
      metadata: {},
    });
  }

  // Strategy context: PROTECTED — deterministic operating guidance.
  if (input.sections.strategyContext) {
    blocks.push({
      id: `${rid}:strategy:primary`,
      source: 'strategy',
      text: input.sections.strategyContext,
      estimatedTokens: estimateBlockTokens(input.sections.strategyContext),
      protected: true,
      metadata: {},
    });
  }

  return blocks;
}

/**
 * SHADOW evaluation. Pure; deterministic; never mutates blocks.
 * Returns the projection (active/deferred) AND per-block decisions.
 */
export function sieveShadow(blocks: ContextBlock[], judgments: SieveJudgments): SievedContext {
  // Transport failed → KEEP_ALL. Error evidence present → KEEP_ALL.
  if (judgments.transportStatus !== 'ok') {
    return keepAll(blocks, judgments.transportStatus === 'malformed' ? 'keep_all_malformed' : 'keep_all_unavailable');
  }

  const decisions: SieveDecision[] = [];
  const active: ContextBlock[] = [];
  const deferred: ContextBlock[] = [];

  for (const b of blocks) {
    // Constitution: protected context is never deferred.
    if (b.protected) {
      decisions.push({ blockId: b.id, disposition: 'active', reasonCode: 'protected' });
      active.push(b);
      continue;
    }
    const relevance = judgments.relevanceByBlock[b.id];
    if (relevance === undefined) {
      // Missing judgment → KEEP.
      decisions.push({ blockId: b.id, disposition: 'active', reasonCode: 'no_judgment_keep' });
      active.push(b);
      continue;
    }
    if (!Number.isFinite(relevance) || relevance < 0 || relevance > 1) {
      // Malformed score → KEEP (uncertain, not irrelevant).
      decisions.push({ blockId: b.id, disposition: 'active', reasonCode: 'malformed_score_keep' });
      active.push(b);
      continue;
    }
    // Asymmetric authority: only STRONG irrelevance defers; anything
    // uncertain stays. Below threshold = strong-evidence-irrelevant.
    if (relevance < SIEVE_DEFER_THRESHOLD) {
      decisions.push({ blockId: b.id, disposition: 'deferred', relevance, reasonCode: 'strong_irrelevance_defer' });
      deferred.push(b);
    } else {
      decisions.push({ blockId: b.id, disposition: 'active', relevance, reasonCode: 'relevant_keep' });
      active.push(b);
    }
  }

  const sum = (xs: ContextBlock[]) => xs.reduce((a, b) => a + b.estimatedTokens, 0);
  return {
    active,
    deferred,
    decisions,
    originalBlockCount: blocks.length,
    originalTokens: sum(blocks),
    activeTokens: sum(active),
    deferredTokens: sum(deferred),
    transportAvailable: true,
  };
}

function keepAll(blocks: ContextBlock[], reason: string): SievedContext {
  const sum = (xs: ContextBlock[]) => xs.reduce((a, b) => a + b.estimatedTokens, 0);
  return {
    active: blocks,
    deferred: [],
    decisions: blocks.map((b) => ({ blockId: b.id, disposition: 'active' as const, reasonCode: reason })),
    originalBlockCount: blocks.length,
    originalTokens: sum(blocks),
    activeTokens: sum(blocks),
    deferredTokens: 0,
    transportAvailable: false,
  };
}

// ── 6A.1 telemetry rows ──────────────────────────────────────────────
// Event construction is PURE and lives here, so the five dataset
// invariants hold BY CONSTRUCTION:
//   1. exactly one request-summary row per buildSieveEvents call
//   2. every candidate block → exactly one row with a deterministic blockId
//   3. the summary reconciles against the block rows (same arrays)
//   4. protected blocks are never emitted as DROP
//   5. failures produce a failOpen summary row via buildFailOpenSummary

export interface ContextSieveEventRow {
  requestId: string;
  /** '__request__' on the summary row. */
  blockId: string;
  /** block source, or 'request_summary'. */
  blockType: string;
  /** Block decisions only; null on the summary row. */
  decision: 'KEEP' | 'DROP' | null;
  reason: string;
  relevanceScore: number | null;
  protected: boolean;
  /** True when the sieve failed open (KEEP_ALL). */
  failOpen: boolean;
  policyVersion: string;
  sieveVersion: string;
  /** Hash of the full retrieval input this decision was made against. */
  inputHash: string;
  /** Hash of this block's content — provenance for future recall/verify. */
  blockHash: string;
  latencyMs: number;
  createdAt: string;
  estimatedTokens: number;
  isSummary: boolean;
  // Summary-only fields.
  candidateTokens?: number;
  proposedActiveTokens?: number;
  proposedDeferredTokens?: number;
  proposedReductionRatio?: number;
  blocksConsidered?: number;
  blocksDeferred?: number;
}

/** djb2 — provenance hash, not cryptographic. Stable + deterministic. */
function hashText(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) {
    h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  }
  return h.toString(16);
}

export function blockHashOf(block: ContextBlock): string {
  return hashText(`${block.source}:${block.text}`);
}

export function inputHashOf(requestId: string, blocks: ContextBlock[]): string {
  return hashText(`${requestId}|${blocks.map((b) => `${b.id}=${blockHashOf(b)}`).join('|')}`);
}

export function buildSieveEvents(args: {
  requestId: string;
  blocks: ContextBlock[];
  sieved: SievedContext;
  latencyMs: number;
  createdAt: string;
}): ContextSieveEventRow[] {
  const { requestId, blocks, sieved, latencyMs, createdAt } = args;
  const inputHash = inputHashOf(requestId, blocks);
  const failOpen = !sieved.transportAvailable;
  const byId = new Map(blocks.map((b) => [b.id, b]));

  const rows: ContextSieveEventRow[] = sieved.decisions.map((d) => {
    const block = byId.get(d.blockId);
    return {
      requestId,
      blockId: d.blockId,
      blockType: block?.source ?? 'unknown',
      decision: d.disposition === 'deferred' ? 'DROP' : 'KEEP',
      reason: d.reasonCode,
      relevanceScore: d.relevance ?? null,
      protected: block?.protected ?? false,
      failOpen,
      policyVersion: SIEVE_POLICY_VERSION,
      sieveVersion: SIEVE_GATE_VERSION,
      inputHash,
      blockHash: block ? blockHashOf(block) : hashText('missing'),
      latencyMs,
      createdAt,
      estimatedTokens: block?.estimatedTokens ?? 0,
      isSummary: false,
    };
  });

  const summary: ContextSieveEventRow = {
    requestId,
    blockId: '__request__',
    blockType: 'request_summary',
    decision: null,
    reason: failOpen ? 'fail_open_keep_all' : 'ok',
    relevanceScore: null,
    protected: false,
    failOpen,
    policyVersion: SIEVE_POLICY_VERSION,
    sieveVersion: SIEVE_GATE_VERSION,
    inputHash,
    blockHash: hashText('__request__'),
    latencyMs,
    createdAt,
    estimatedTokens: sieved.originalTokens,
    isSummary: true,
    candidateTokens: sieved.originalTokens,
    proposedActiveTokens: sieved.activeTokens,
    proposedDeferredTokens: sieved.deferredTokens,
    proposedReductionRatio: sieved.originalTokens ? sieved.deferredTokens / sieved.originalTokens : 0,
    blocksConsidered: sieved.originalBlockCount,
    blocksDeferred: sieved.deferred.length,
  };
  rows.push(summary);
  return rows;
}

/** Failure path: exactly one failOpen summary row, even when the block
 *  projection itself exploded. Reconciliation holds trivially (0 blocks). */
export function buildFailOpenSummary(args: {
  requestId: string;
  reason: string;
  latencyMs: number;
  createdAt: string;
  blocksConsidered?: number;
  message?: string;
}): ContextSieveEventRow {
  return {
    requestId: args.requestId,
    blockId: '__request__',
    blockType: 'request_summary',
    decision: null,
    reason: `fail_open:${args.reason}`,
    relevanceScore: null,
    protected: false,
    failOpen: true,
    policyVersion: SIEVE_POLICY_VERSION,
    sieveVersion: SIEVE_GATE_VERSION,
    inputHash: hashText(`failopen:${args.requestId}:${args.message ?? ''}`),
    blockHash: hashText('__request__'),
    latencyMs: args.latencyMs,
    createdAt: args.createdAt,
    estimatedTokens: 0,
    isSummary: true,
    candidateTokens: 0,
    proposedActiveTokens: 0,
    proposedDeferredTokens: 0,
    proposedReductionRatio: 0,
    blocksConsidered: args.blocksConsidered ?? 0,
    blocksDeferred: 0,
  };
}
