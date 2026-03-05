import { supabase } from "@/lib/supabaseClient";
import { ClaimAuditResult, AuditSummary, ModelTruthScore } from "./types";

export class AuditLogger {
  async logAuditResults(results: ClaimAuditResult[]): Promise<void> {
    if (!results || results.length === 0) return;

    try {
      // Fire-and-forget: we don't await the insert
      // Batch insert into 'ai_output_audit'
      const rows = results.map(r => ({
        created_at: new Date(),
        session_id: r.sessionId,
        model: r.model,
        claim_text: r.claim.text,
        claim_embedding: r.claim.embedding, // Assuming vector type in Supabase
        verdict: r.verdict,
        confidence: r.claim.confidence,
        graph_edge_id: r.graphEdgeId,
        contradicts_node: r.contradictsNodeId,
        delta_score: r.deltaScore,
        domain: r.claim.domain,
        explanation: r.explanation
      }));

      const { error } = await supabase.from('ai_output_audit').insert(rows);

      if (error) {
        console.error("AuditLogger: Failed to log audit results", error);
      }
    } catch (e) {
      console.error("AuditLogger: Exception logging audit results", e);
    }
  }

  async getAuditSummary(sessionId: string): Promise<AuditSummary | null> {
    try {
      const { data, error } = await supabase
        .from('ai_output_audit')
        .select('verdict, delta_score')
        .eq('session_id', sessionId);

      if (error) throw error;
      if (!data || data.length === 0) return null;

      const totalClaims = data.length;
      const verdictCounts = data.reduce((acc: any, row: any) => {
        acc[row.verdict] = (acc[row.verdict] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const totalDelta = data.reduce((sum: number, row: any) => sum + (row.delta_score || 0), 0);
      const averageDeltaScore = totalDelta / totalClaims;

      // Hallucination rate: (CONTRADICTED + MISATTRIBUTED) / total
      const hallucinationCount = (verdictCounts['CONTRADICTED'] || 0) + (verdictCounts['MISATTRIBUTED'] || 0);
      const hallucinationRate = hallucinationCount / totalClaims;

      return {
        sessionId,
        totalClaims,
        verdictCounts: verdictCounts as any,
        averageDeltaScore,
        hallucinationRate
      };

    } catch (e) {
      console.error("AuditLogger: Failed to get audit summary", e);
      return null;
    }
  }

  async getModelTruthScores(model?: string): Promise<ModelTruthScore[]> {
    try {
      let query = supabase.from('model_truth_scores').select('*');
      
      if (model) {
        query = query.eq('model', model);
      }

      const { data, error } = await query;
      
      if (error) throw error;
      
      return data as ModelTruthScore[];
    } catch (e) {
      console.error("AuditLogger: Failed to get model truth scores", e);
      return [];
    }
  }
}

export const auditLogger = new AuditLogger();
