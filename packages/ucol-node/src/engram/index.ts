/**
 * @file engram/index.ts
 * @description Engram Protocol — 5-step memory distillation (spec §8.2).
 *
 * Converts raw episodic History (H) into durable semantic Knowledge (K),
 * reducing token overhead without losing decision-relevant information.
 *
 * Trigger: session close OR raw H > 50KB.
 * k-means k = max(3, floor(turns / 10)).
 */

import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type {
  HistoryItem,
  KnowledgeItem,
  KnowledgeType,
  UUID,
  DID,
} from '../store/schema.js';
import type { ContextStore } from '../store/index.js';

/** Raw extracted fact from Gemini */
interface RawFact {
  content: string;
  type: KnowledgeType;
  confidence: number;
}

/** Engram distillation report */
export interface EngramReport {
  input_bytes: number;
  output_k_items: number;
  compression_ratio: number;
  dropped_below_threshold: number;
  clusters_formed: number;
  session_id: UUID;
}

/**
 * Cosine similarity for embedding vectors.
 * Returns 0 for zero vectors or mismatched lengths.
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

/**
 * Compute bigram-based text similarity as an embedding proxy.
 * Used when real embeddings are unavailable for deduplication.
 */
function textCosineSim(a: string, b: string): number {
  if (a === b) return 1.0;
  const bigrams = (s: string): Map<string, number> => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const bg = s.slice(i, i + 2).toLowerCase();
      m.set(bg, (m.get(bg) ?? 0) + 1);
    }
    return m;
  };
  const mA = bigrams(a);
  const mB = bigrams(b);
  const allKeys = new Set([...mA.keys(), ...mB.keys()]);
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (const k of allKeys) {
    const va = mA.get(k) ?? 0;
    const vb = mB.get(k) ?? 0;
    dot += va * vb;
    magA += va * va;
    magB += vb * vb;
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Naive k-means clustering of HistoryItems by content similarity.
 * Uses text bigram vectors as a proxy for 768-dim embeddings.
 *
 * @param items - HistoryItems to cluster
 * @param k - Number of clusters
 * @returns Array of cluster member arrays
 */
function kMeansCluster(items: HistoryItem[], k: number): HistoryItem[][] {
  if (items.length === 0) return [];
  if (items.length <= k) return items.map((item) => [item]);

  // Initialize centroids as evenly-spaced items
  const step = Math.floor(items.length / k);
  const centroidTexts: string[] = Array.from({ length: k }, (_, i) => items[i * step].content);
  const clusters: HistoryItem[][] = Array.from({ length: k }, () => []);

  // Single-pass assignment (simplified k-means for non-vector data)
  for (const item of items) {
    let bestCluster = 0;
    let bestSim = -1;
    for (let c = 0; c < k; c++) {
      const sim = textCosineSim(item.content, centroidTexts[c]);
      if (sim > bestSim) {
        bestSim = sim;
        bestCluster = c;
      }
    }
    clusters[bestCluster].push(item);
  }

  // Remove empty clusters
  return clusters.filter((c) => c.length > 0);
}

/**
 * EngramEngine — implements the 5-step Engram distillation algorithm.
 */
export class EngramEngine {
  private readonly store: ContextStore;
  private readonly geminiApiKey: string;
  private readonly minConfidence: number;

  /**
   * @param store - ContextStore for reading H and writing K
   * @param geminiApiKey - Gemini API key for structured extraction
   * @param minConfidence - Minimum confidence to persist (default: 0.3)
   */
  constructor(store: ContextStore, geminiApiKey: string, minConfidence: number = 0.3) {
    this.store = store;
    this.geminiApiKey = geminiApiKey;
    this.minConfidence = minConfidence;
  }

  /**
   * Run the 5-step Engram distillation for a session.
   *
   * Spec §8.2 steps:
   * 1. Cluster H items with k-means (k = max(3, floor(turns / 10)))
   * 2. Summarize each cluster via Gemini Flash (structured JSON)
   * 3. Deduplicate: cosine_sim > 0.92 → keep higher confidence
   * 4. Persist K_i items with confidence >= 0.3
   * 5. Report compression stats
   *
   * @param sessionId - Session to distill
   * @param agentId - Agent who owns the session
   * @returns EngramReport with distillation stats
   */
  async distill(sessionId: UUID, agentId: DID): Promise<EngramReport> {
    // ── Step 1 — Cluster ──────────────────────────────────────────────────────
    // Input: all undistilled H items for this session
    const hItems = await this.store.getSessionHistory(sessionId, false);
    if (hItems.length === 0) {
      return {
        input_bytes: 0,
        output_k_items: 0,
        compression_ratio: 1.0,
        dropped_below_threshold: 0,
        clusters_formed: 0,
        session_id: sessionId,
      };
    }

    const inputBytes = hItems.reduce(
      (acc, h) => acc + Buffer.byteLength(h.content, 'utf8'),
      0
    );

    // k = max(3, floor(turns / 10))
    const k = Math.max(3, Math.floor(hItems.length / 10));
    const clusters = kMeansCluster(hItems, k);

    // ── Step 2 — Summarize each cluster ──────────────────────────────────────
    // Extract structured facts from each cluster via Gemini Flash
    const allRawFacts: Array<RawFact & { clusterId: number }> = [];

    for (let i = 0; i < clusters.length; i++) {
      const cluster = clusters[i];
      const clusterText = cluster.map((h) => `${h.role}: ${h.content}`).join('\n');
      const facts = await this.extractFacts(clusterText);
      for (const fact of facts) {
        allRawFacts.push({ ...fact, clusterId: i });
      }
    }

    // ── Step 3 — Deduplicate and merge ────────────────────────────────────────
    // For each pair with cosine_sim > 0.92 → keep higher confidence
    const deduplicated = this.deduplicateFacts(allRawFacts);

    // ── Step 4 — Persist K_i items with confidence >= 0.3 ────────────────────
    const persistedIds: UUID[] = [];
    let droppedCount = 0;

    for (const fact of deduplicated) {
      if (fact.confidence < this.minConfidence) {
        droppedCount++;
        continue;
      }

      const now = new Date().toISOString();
      const provenance = createHash('sha256')
        .update(`${sessionId}:${fact.clusterId}`)
        .digest('hex');

      const kItem: KnowledgeItem = {
        id: uuidv4(),
        content: fact.content,
        type: fact.type,
        confidence: fact.confidence,
        source: agentId,
        valid_from: now,
        valid_until: null,
        provenance,
        // Stub signature — production would use node private key
        signature: Buffer.from(new Uint8Array(64)).toString('base64url'),
        embedding: null,
        security_tier: 'INTERNAL', // Distilled facts default to INTERNAL
      };

      await this.store.upsertKnowledge(kItem);
      persistedIds.push(kItem.id);
    }

    // Mark H items as distilled
    await this.store.markDistilled(hItems.map((h) => h.id));

    // ── Step 5 — Report ───────────────────────────────────────────────────────
    const estimatedOutputBytes =
      persistedIds.length * 256; // avg ~256 bytes per K_i
    const compressionRatio =
      inputBytes > 0 ? inputBytes / Math.max(estimatedOutputBytes, 1) : 1.0;

    return {
      input_bytes: inputBytes,
      output_k_items: persistedIds.length,
      compression_ratio: compressionRatio,
      dropped_below_threshold: droppedCount,
      clusters_formed: clusters.length,
      session_id: sessionId,
    };
  }

  /**
   * Extract structured facts from a cluster text using Gemini Flash.
   * Falls back to an empty array on API error.
   *
   * @param clusterText - Concatenated history turns for a cluster
   * @returns Array of raw facts
   */
  private async extractFacts(clusterText: string): Promise<RawFact[]> {
    try {
      const genAI = new GoogleGenerativeAI(this.geminiApiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

      const prompt = `Extract structured facts from this conversation segment.
For each fact, provide:
- content: the fact in one sentence (max 200 chars)
- type: one of FACT | CONSTRAINT | PREFERENCE | GOAL | ASSERTION
- confidence: float 0.0 to 1.0

Return ONLY a JSON array, no markdown, no explanation:
[{"content": "...", "type": "FACT", "confidence": 0.9}]

Conversation:
${clusterText.slice(0, 4000)}`;

      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();

      // Extract JSON array from response
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return [];

      const parsed = JSON.parse(jsonMatch[0]) as unknown[];
      return parsed.filter(isValidRawFact).map((f) => f as RawFact);
    } catch {
      return [];
    }
  }

  /**
   * Deduplicate facts: cosine_sim > 0.92 → keep higher confidence.
   *
   * @param facts - All raw facts from all clusters
   * @returns Deduplicated fact array
   */
  private deduplicateFacts(
    facts: Array<RawFact & { clusterId: number }>
  ): Array<RawFact & { clusterId: number }> {
    const result: Array<RawFact & { clusterId: number }> = [];
    const removed = new Set<number>();

    for (let i = 0; i < facts.length; i++) {
      if (removed.has(i)) continue;

      let winner = facts[i];
      let winnerIdx = i;

      for (let j = i + 1; j < facts.length; j++) {
        if (removed.has(j)) continue;
        const sim = textCosineSim(facts[i].content, facts[j].content);
        if (sim > 0.92) {
          // Keep higher confidence
          if (facts[j].confidence > winner.confidence) {
            removed.add(winnerIdx);
            winner = facts[j];
            winnerIdx = j;
          } else {
            removed.add(j);
          }
        }
      }

      if (!removed.has(winnerIdx)) {
        result.push(winner);
        removed.add(winnerIdx); // prevent re-processing
      }
    }

    return result;
  }
}

/** Type guard for raw fact objects */
function isValidRawFact(obj: unknown): obj is RawFact {
  if (typeof obj !== 'object' || obj === null) return false;
  const o = obj as Record<string, unknown>;
  const validTypes: KnowledgeType[] = ['FACT', 'CONSTRAINT', 'PREFERENCE', 'GOAL', 'ASSERTION'];
  return (
    typeof o['content'] === 'string' &&
    typeof o['type'] === 'string' &&
    (validTypes as string[]).includes(o['type']) &&
    typeof o['confidence'] === 'number'
  );
}
