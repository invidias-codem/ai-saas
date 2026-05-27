"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditLogger = exports.AuditLogger = void 0;
const supabaseClient_1 = require("@/lib/supabaseClient");
class AuditLogger {
    async logAuditResults(results) {
        if (!results || results.length === 0)
            return;
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
            const { error } = await supabaseClient_1.supabase.from('ai_output_audit').insert(rows);
            if (error) {
                console.error("AuditLogger: Failed to log audit results", error);
            }
        }
        catch (e) {
            console.error("AuditLogger: Exception logging audit results", e);
        }
    }
    async getAuditSummary(sessionId) {
        try {
            const { data, error } = await supabaseClient_1.supabase
                .from('ai_output_audit')
                .select('verdict, delta_score')
                .eq('session_id', sessionId);
            if (error)
                throw error;
            if (!data || data.length === 0)
                return null;
            const totalClaims = data.length;
            const verdictCounts = data.reduce((acc, row) => {
                acc[row.verdict] = (acc[row.verdict] || 0) + 1;
                return acc;
            }, {});
            const totalDelta = data.reduce((sum, row) => sum + (row.delta_score || 0), 0);
            const averageDeltaScore = totalDelta / totalClaims;
            // Hallucination rate: (CONTRADICTED + MISATTRIBUTED) / total
            const hallucinationCount = (verdictCounts['CONTRADICTED'] || 0) + (verdictCounts['MISATTRIBUTED'] || 0);
            const hallucinationRate = hallucinationCount / totalClaims;
            return {
                sessionId,
                totalClaims,
                verdictCounts: verdictCounts,
                averageDeltaScore,
                hallucinationRate
            };
        }
        catch (e) {
            console.error("AuditLogger: Failed to get audit summary", e);
            return null;
        }
    }
    async getModelTruthScores(model) {
        try {
            let query = supabaseClient_1.supabase.from('model_truth_scores').select('*');
            if (model) {
                query = query.eq('model', model);
            }
            const { data, error } = await query;
            if (error)
                throw error;
            return data;
        }
        catch (e) {
            console.error("AuditLogger: Failed to get model truth scores", e);
            return [];
        }
    }
}
exports.AuditLogger = AuditLogger;
exports.auditLogger = new AuditLogger();
