import { 
  ClaimAuditResult, 
  DeltaEngineConfig, 
  ClaimVerdict,
  ModelTruthScore
} from "./types";
import { ExtractedClaim } from "./types";
import { claimExtractor } from "./ClaimExtractor";
import { graphLookup } from "./GraphLookup";
import { auditLogger } from "./AuditLogger";
import { supabase } from "@/lib/supabaseClient";
import type { DeltaPayload } from "../types";

export class DeltaEngine {
  private static instance: DeltaEngine;
  private config: DeltaEngineConfig;

  constructor(config?: Partial<DeltaEngineConfig>) {
    this.config = {
      enabledDomains: config?.enabledDomains || ['code', 'current_events', 'product', 'personal', 'general'],
      minConfidenceThreshold: config?.minConfidenceThreshold || 0.7,
      similarityThresholds: config?.similarityThresholds || {
        confirmed: 0.92,
        supported: 0.75,
        unverified: 0.4
      }
    };
  }

  static getInstance(): DeltaEngine {
    if (!DeltaEngine.instance) {
      DeltaEngine.instance = new DeltaEngine();
    }
    return DeltaEngine.instance;
  }

  async scoreClaims(
    aiOutput: string,
    sessionId: string,
    modelName: string,
    overrideConfig?: Partial<DeltaEngineConfig>
  ): Promise<ClaimAuditResult[]> {
    const config = { ...this.config, ...overrideConfig };
    
    try {
      // 1. Extract claims
      const claims = await claimExtractor.extractClaims(aiOutput, sessionId, modelName);
      
      if (!claims || claims.length === 0) {
        return [];
      }

      // 2. Evaluate each claim against the graph
      const auditResults: ClaimAuditResult[] = await Promise.all(
        claims.map(async (claim) => {
          if (!config.enabledDomains.includes(claim.domain)) {
             return {
               claim,
               verdict: 'UNVERIFIED',
               deltaScore: 0.5,
               explanation: `Domain '${claim.domain}' is disabled in Delta Engine config.`,
               model: modelName,
               sessionId,
               timestamp: new Date()
             };
          }

          const lookup = await graphLookup.lookupClaim(claim);
          
          let deltaScore = 0.5; // Default UNVERIFIED
          switch (lookup.verdict) {
            case 'CONFIRMED': deltaScore = 0.0; break;
            case 'SUPPORTED': deltaScore = 0.2; break;
            case 'UNVERIFIED': deltaScore = 0.5; break;
            case 'OUTDATED': deltaScore = 0.6; break;
            case 'MISATTRIBUTED': deltaScore = 0.8; break;
            case 'CONTRADICTED': deltaScore = 1.0; break;
          }

          // Mutation: on contradiction, obsoleted the contradicted entity via
          // an OBSOLETED event (append-only, event-sourced) rather than an UPDATE.
          if (lookup.verdict === 'CONTRADICTED' && lookup.contradictsNodeId) {
            void this.writeObsolescenceEvent({
              obsoleteEntityId: lookup.contradictsNodeId,
              claim,
              graphEdgeId: lookup.graphEdgeId,
            });
          }

          return {
            claim,
            verdict: lookup.verdict,
            deltaScore,
            graphEdgeId: lookup.graphEdgeId,
            contradictsNodeId: lookup.contradictsNodeId,
            explanation: lookup.explanation,
            model: modelName,
            sessionId,
            timestamp: new Date()
          };
        })
      );

      // 3. Log results (async, fire-and-forget)
      void auditLogger.logAuditResults(auditResults);

      return auditResults;

    } catch (error) {
      console.error("DeltaEngine scoreClaims failed:", error);
      return []; // Fail safe
    }
  }

  computeDeltaScore(results: ClaimAuditResult[]): number {
    if (!results.length) return 0;
    
    const totalScore = results.reduce((sum, r) => sum + r.deltaScore, 0);
    return totalScore / results.length;
  }

  /**
   * Mutation path — event-sourced append-only.
   *
   * When a claim CONTRADICTS a graph entity, the entity is obsoleted by
   * writing an OBSOLETED event with a strict delta payload, NOT by mutating
   * knowledge_nodes.valid_until. The DB trigger enforces the delta contract.
   */
  private async writeObsolescenceEvent(params: {
    obsoleteEntityId: string;
    claim: ExtractedClaim;
    graphEdgeId?: string;
  }): Promise<void> {
    const { obsoleteEntityId, claim, graphEdgeId } = params;

    const delta: DeltaPayload = {
      before: { valid: true },
      after: null, // OBSOLETED
      reason: `Contradicted by claim "${claim.text}" (claim ${claim.id})`,
      evidence: graphEdgeId ? [{ edge_id: graphEdgeId, weight: 1.0 }] : [],
      score: 1.0, // full contradiction
    };

    const { error } = await supabase.from('wm_events').insert({
      entity_id: obsoleteEntityId,
      event_type: 'OBSOLETED',
      payload: { entity_type: 'node', delta },
      trust_tier: 'SUPPORTED',
      source_model: 'delta-engine',
      context_version_id: claim.id,
    });

    if (error) {
      console.error('[DeltaEngine] Failed to write OBSOLETED event:', error);
    }
  }

  async getModelTruthScore(model: string, domain?: string): Promise<ModelTruthScore | null> {
    try {
      let query = supabase
        .from('model_truth_scores')
        .select('*')
        .eq('model', model);
      
      if (domain) {
        query = query.eq('domain', domain);
      }
      
      const { data, error } = await query.single();
      
      if (error) {
        console.warn("Failed to fetch model truth score:", error);
        return null;
      }
      
      return data as ModelTruthScore;
    } catch (e) {
      console.error("Error in getModelTruthScore:", e);
      return null;
    }
  }
}

export const deltaEngine = new DeltaEngine();
