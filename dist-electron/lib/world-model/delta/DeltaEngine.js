"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deltaEngine = exports.DeltaEngine = void 0;
const ClaimExtractor_1 = require("./ClaimExtractor");
const GraphLookup_1 = require("./GraphLookup");
const AuditLogger_1 = require("./AuditLogger");
const supabaseClient_1 = require("@/lib/supabaseClient");
class DeltaEngine {
    static instance;
    config;
    constructor(config) {
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
    static getInstance() {
        if (!DeltaEngine.instance) {
            DeltaEngine.instance = new DeltaEngine();
        }
        return DeltaEngine.instance;
    }
    async scoreClaims(aiOutput, sessionId, modelName, overrideConfig) {
        const config = { ...this.config, ...overrideConfig };
        try {
            // 1. Extract claims
            const claims = await ClaimExtractor_1.claimExtractor.extractClaims(aiOutput, sessionId, modelName);
            if (!claims || claims.length === 0) {
                return [];
            }
            // 2. Evaluate each claim against the graph
            const auditResults = await Promise.all(claims.map(async (claim) => {
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
                const lookup = await GraphLookup_1.graphLookup.lookupClaim(claim);
                let deltaScore = 0.5; // Default UNVERIFIED
                switch (lookup.verdict) {
                    case 'CONFIRMED':
                        deltaScore = 0.0;
                        break;
                    case 'SUPPORTED':
                        deltaScore = 0.2;
                        break;
                    case 'UNVERIFIED':
                        deltaScore = 0.5;
                        break;
                    case 'OUTDATED':
                        deltaScore = 0.6;
                        break;
                    case 'MISATTRIBUTED':
                        deltaScore = 0.8;
                        break;
                    case 'CONTRADICTED':
                        deltaScore = 1.0;
                        break;
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
            }));
            // 3. Log results (async, fire-and-forget)
            void AuditLogger_1.auditLogger.logAuditResults(auditResults);
            return auditResults;
        }
        catch (error) {
            console.error("DeltaEngine scoreClaims failed:", error);
            return []; // Fail safe
        }
    }
    computeDeltaScore(results) {
        if (!results.length)
            return 0;
        const totalScore = results.reduce((sum, r) => sum + r.deltaScore, 0);
        return totalScore / results.length;
    }
    async getModelTruthScore(model, domain) {
        try {
            let query = supabaseClient_1.supabase
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
            return data;
        }
        catch (e) {
            console.error("Error in getModelTruthScore:", e);
            return null;
        }
    }
}
exports.DeltaEngine = DeltaEngine;
exports.deltaEngine = new DeltaEngine();
