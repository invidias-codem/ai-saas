/**
 * lib/ucol/agentRouter.ts
 *
 * UCOL Unified Agent Router — with Confidence-Aware Routing
 *
 * Classifies incoming tasks and routes them to the most capable node.
 * Now supports a second routing dimension: memory context confidence.
 *
 * Two-axis routing:
 *   Axis 1 — Task Type  (static, rules-based)
 *   Axis 2 — Context Confidence  (dynamic, learned)
 *
 * When memory facts are provided, confidence scores override the static
 * model target for "flexible" task types. Fixed pipelines (code generation,
 * research, orchestration) are never overridden — they own their routing.
 *
 * Routing targets:
 *   hermes-local    → self-hosted Ollama/Hermes3 on GKE (fast, zero API cost)
 *   gemini-flash    → fast answers, fact extraction, embeddings
 *   claude          → quality code generation, nuanced analysis
 *   deepseek        → deep reasoning, multi-step logic
 *   jklaw           → research, strategy, orchestration, co-founder thinking
 *   context-router  → full Gemini→Claude→Gemini code builder pipeline
 */

import { GeminiProvider } from '@/lib/llm/providers/gemini';
import type { ExtractedFact } from '@/lib/intelligentMemory';
import {
  scoreContextForRouting,
  type ConfidenceModelTier,
  type ConfidenceRoutingSignal,
  type AggregationStrategy,
  DEFAULT_BASE_CONFIDENCE,
} from '@/lib/memory/confidenceScoring';
import { findMatchingProcedure } from './proceduralMemory';
import type { ToolStep } from './proceduralMemory';

// ─── Task Classification ────────────────────────────────────────────────────

export type TaskType =
    | 'code_generation'      // → ContextRouter (Gemini→Claude→review loop)
    | 'quick_answer'         // → Gemini Flash  (confidence-overridable)
    | 'quality_analysis'     // → Claude        (confidence-overridable)
    | 'deep_reasoning'       // → DeepSeek R1   (confidence-overridable)
    | 'memory_extract'       // → MemoryRouter (Gemini)
    | 'memory_synthesize'    // → MemoryRouter (DeepSeek or Gemini)
    | 'user_profile'         // → MemoryRouter (Claude)
    | 'research'             // → JKlaw  (fixed — needs persistent memory)
    | 'strategy'             // → JKlaw  (fixed — needs persistent memory)
    | 'orchestration'        // → JKlaw  (fixed — needs persistent memory)
    | 'database_query'       // → supabase tool node
    | 'migration'            // → supabase tool node
    | 'db_inspect'           // → supabase tool node
    | 'edge_functions'       // → supabase tool node
    | 'repo_management'      // → gh tool node
    | 'pr_management'        // → gh tool node
    | 'ci_status'            // → gh tool node
    | 'issue_tracking'       // → gh tool node
    | 'deployment_debug'     // → gh/firebase tool node
    | 'deployment'           // → firebase tool node
    | 'hosting'              // → firebase tool node
    | 'auth_management'      // → firebase tool node
    | 'firestore_ops'        // → firebase tool node
    | 'unknown';             // → Gemini Flash (fallback, confidence-overridable)

/** Task types where confidence can override the static model target */
const CONFIDENCE_OVERRIDABLE = new Set<TaskType>([
  'quick_answer',
  'quality_analysis',
  'deep_reasoning',
  'unknown',
]);

/**
 * Map from confidence tier to router target node.
 * Typed against ConfidenceModelTier so TypeScript enforces completeness —
 * any new tier added to confidenceScoring.ts must be handled here too.
 */
const CONFIDENCE_TIER_TO_NODE: Record<ConfidenceModelTier, RoutingDecision['targetNode']> = {
  'gemini-flash':  'gemini-flash',
  'deepseek':      'deepseek',
  'claude-sonnet': 'claude',
} as Record<ConfidenceModelTier, RoutingDecision['targetNode']>;

/**
 * Cost/capability rank for each target node (ascending = cheaper/faster).
 * Used to determine whether a confidence override is an upgrade or downgrade
 * based on actual node comparison, not raw confidence score.
 */
// NODE_COST_RANK only applies to LLM nodes — tools are bypassed by the
// isToolNode() guard below and never go through confidence override logic.
const LLM_NODE_COST_RANK: Partial<Record<string, number>> = {
  'hermes-local':   0,  // self-hosted, zero API cost — cheapest tier
  'gemini-flash':   1,
  'deepseek':       2,
  'context-router': 2,
  'claude':         3,
  'jklaw':          3,
};

/** True when the self-hosted Ollama GKE node is configured and should be used */
const OLLAMA_GKE_ENABLED = !!process.env.OLLAMA_GKE_URL;

/** Returns true when a routing decision targets a CLI tool harness */
export function isToolNode(targetNode: RoutingDecision['targetNode']): boolean {
  return targetNode.startsWith('tool:');
}

/** Extracts the harness name from a tool node target, e.g. "tool:supabase" → "supabase" */
export function getToolName(targetNode: RoutingDecision['targetNode']): string | null {
  return isToolNode(targetNode) ? targetNode.slice(5) : null;
}

export interface RoutingDecision {
    taskType: TaskType;
    targetNode: 'hermes-local' | 'gemini-flash' | 'claude' | 'deepseek' | 'jklaw' | 'context-router' | `tool:${string}`;
    confidence: number;      // 0.0 – 1.0 — classifier confidence in task type
    reasoning: string;
    jklawWebhook?: boolean;  // if true, dispatch to JKlaw asynchronously
    /** Present when memory facts were scored and influenced routing */
    memorySignal?: ConfidenceRoutingSignal;
    /** True when confidence scoring changed the model from the static default */
    confidenceOverride?: boolean;
    /** Enforced gate for destructive actions (T-008) */
    allowDestructiveActions?: boolean;
    /** Source of this routing decision */
    source?: 'procedural_memory' | 'llm_routing';
    /** Populated when source is 'procedural_memory' — the pre-learned tool sequence */
    proceduralSequence?: ToolStep[];
}

export interface AgentRouterGoalContext {
    /** Current sprint or mission goal (from GOALS.md / product roadmap) */
    currentGoal?: string;
    /** User's recent conversation topics from knowledge graph */
    recentTopics?: string[];
    /** User's subscription tier — affects routing priority and budget */
    userTier?: 'free' | 'pro' | 'enterprise';
    /** Session intent — what the user is trying to accomplish this session */
    sessionIntent?: string;
}

export interface AgentRouterTask {
    query: string;
    /** Required: Clerk user ID — enforces tenant isolation on all dispatches */
    userId: string;
    context?: string;        // additional context (previous messages, facts, etc.)
    preferSpeed?: boolean;   // hint: prioritize latency over quality
    requireOrchestration?: boolean; // hint: this task needs multi-step coordination
    /** Retrieved memory facts — triggers confidence-aware routing when provided */
    memoryFacts?: ExtractedFact[];
    /** Override aggregation strategy (default: 'minimum' — conservative) */
    confidenceStrategy?: AggregationStrategy;
    /** Goal ancestry context — gives routing nodes the "why" behind this task */
    goalContext?: AgentRouterGoalContext;
    /** Require human approval before performing destructive actions (T-008) */
    allowDestructiveActions?: boolean;
}

export interface AgentRouterResult {
    decision: RoutingDecision;
    response?: string;       // populated when handled locally (non-JKlaw routes)
    dispatched?: boolean;    // true when async-dispatched to JKlaw
    error?: string;
}

// ─── Classifier Prompt ──────────────────────────────────────────────────────

const CLASSIFIER_SYSTEM_PROMPT = `You are a task routing classifier for an AI orchestration system.

Given a user query and optional context, classify it into exactly ONE of these task types:

- code_generation: Writing, modifying, or reviewing code
- quick_answer: Simple factual questions, short lookups, yes/no
- quality_analysis: In-depth technical analysis, architecture review, detailed explanations
- deep_reasoning: Multi-step logical problems, math, debate, complex inference chains
- memory_extract: Extracting structured facts from a conversation
- memory_synthesize: Synthesizing multiple facts into coherent context
- user_profile: Building or updating a user profile from conversations
- research: Multi-source information gathering, topic deep-dives, competitive analysis
- strategy: Product strategy, business decisions, roadmaps, prioritization
- orchestration: Tasks that require coordinating multiple agents or multi-step workflows
- database_query: Direct database queries, data extraction
- migration: Database schema migrations, up/down/status
- db_inspect: Inspecting DB health, bloat, locks, indexes
- edge_functions: Supabase Edge Functions deployment or logs
- repo_management: GitHub repo listing, cloning, syncing
- pr_management: GitHub Pull Request creation, review, merging
- ci_status: GitHub Actions workflow runs, logs, status
- issue_tracking: GitHub Issues creation, closing, commenting
- deployment: Firebase/Hosting/Vercel deployments
- deployment_debug: Investigating failed deployments, hosting logs
- hosting: Managing preview channels, domain mapping
- auth_management: Firebase Auth user management
- firestore_ops: Firestore data import/export, rules, indexes
- unknown: Doesn't fit any category

Respond with ONLY a JSON object:
{
  "taskType": "<task_type>",
  "confidence": <0.0-1.0>,
  "reasoning": "<one sentence>"
}`;

// ─── Static Routing Table ───────────────────────────────────────────────────

const ROUTING_TABLE: Record<TaskType, RoutingDecision['targetNode']> = {
    // ── LLM nodes ───────────────────────────────────────────────────────
    code_generation:   'context-router',
    quick_answer:      OLLAMA_GKE_ENABLED ? 'hermes-local' : 'gemini-flash',
    quality_analysis:  'claude',
    deep_reasoning:    'deepseek',
    memory_extract:    'gemini-flash',
    memory_synthesize: 'deepseek',
    user_profile:      'claude',
    research:          'jklaw',
    strategy:          'jklaw',
    orchestration:     'jklaw',
    // ── Tool nodes: Supabase ─────────────────────────────────────────────
    database_query:    'tool:supabase',
    migration:         'tool:supabase',
    db_inspect:        'tool:supabase',
    edge_functions:    'tool:supabase',
    // ── Tool nodes: GitHub CLI ───────────────────────────────────────────
    repo_management:   'tool:gh',
    pr_management:     'tool:gh',
    ci_status:         'tool:gh',
    issue_tracking:    'tool:gh',
    deployment_debug:  'tool:gh',
    // ── Tool nodes: Firebase ─────────────────────────────────────────────
    deployment:        'tool:firebase',
    hosting:           'tool:firebase',
    auth_management:   'tool:firebase',
    firestore_ops:     'tool:firebase',
    // ── Fallback ─────────────────────────────────────────────────────────
    unknown:           'gemini-flash',
};

// ─── AgentRouter ────────────────────────────────────────────────────────────

export class AgentRouter {
    private gemini: GeminiProvider;
    private jklawUrl: string;
    private jklawKey: string | undefined;

    constructor() {
        this.gemini = new GeminiProvider();
        this.jklawUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://gen1e.xyz'}/api/internal/jklaw`;
        this.jklawKey = process.env.JKLAW_API_KEY;
    }

    // ─── Classify a task ─────────────────────────────────────────────────

    async classify(task: AgentRouterTask): Promise<RoutingDecision> {
        // Fast-path overrides (highest priority — never confidence-overridden)
        if (task.requireOrchestration) {
            return {
                taskType: 'orchestration',
                targetNode: 'jklaw',
                confidence: 1.0,
                reasoning: 'Caller explicitly requested orchestration',
                jklawWebhook: true,
                allowDestructiveActions: task.allowDestructiveActions ?? false,
            };
        }

        if (task.preferSpeed) {
            return {
                taskType: 'quick_answer',
                targetNode: 'gemini-flash',
                confidence: 0.8,
                reasoning: 'Speed preferred — routing to Gemini Flash',
                allowDestructiveActions: task.allowDestructiveActions ?? false,
            };
        }

        // ── Procedural Memory Fast-Path ───────────────────────────────────
        // Check for a pre-learned tool sequence BEFORE hitting the LLM.
        // This block is purely additive — any error falls through to normal routing.
        try {
            const proceduralMatch = await findMatchingProcedure(task.userId, task.query);
            if (
                proceduralMatch &&
                proceduralMatch.isStableMacro &&
                proceduralMatch.similarity > 0.92
            ) {
                // Derive taskType from the matched record — it was stored at record time
                const proceduralTaskType = (proceduralMatch.record.taskType as TaskType) ?? 'unknown';
                const staticTarget = ROUTING_TABLE[proceduralTaskType] ?? 'gemini-flash';

                console.log(
                    `[AgentRouter] ⚡ Procedural memory fast-path for "${task.query.substring(0, 60)}"` +
                    ` (similarity=${proceduralMatch.similarity.toFixed(3)}, procedure=${proceduralMatch.record.id})`
                );

                return {
                    taskType: proceduralTaskType,
                    targetNode: staticTarget,
                    confidence: 1.0,
                    reasoning: `Procedural memory macro hit (similarity=${proceduralMatch.similarity.toFixed(3)})`,
                    jklawWebhook: staticTarget === 'jklaw',
                    allowDestructiveActions: task.allowDestructiveActions ?? false,
                    source: 'procedural_memory',
                    proceduralSequence: proceduralMatch.record.toolSequence,
                };
            }
        } catch (pmErr: unknown) {
            // Never block routing on procedural memory errors
            const msg = pmErr instanceof Error ? pmErr.message : String(pmErr);
            console.warn('[AgentRouter] Procedural memory lookup failed (falling through):', msg);
        }

        // Score memory context confidence if facts are provided
        const memorySignal = task.memoryFacts && task.memoryFacts.length > 0
            ? scoreContextForRouting(task.memoryFacts, task.confidenceStrategy ?? 'minimum')
            : null;

        // Classify task type via Gemini Flash
        let taskType: TaskType = 'unknown';
        let classifierConfidence = DEFAULT_BASE_CONFIDENCE;
        let classifierReasoning = 'Unclassified — defaulting to Gemini Flash';

        try {
            const result = await this.gemini.generateStream(
                [{ role: 'user', text: `Query: ${task.query}${task.context ? `\n\nContext: ${task.context.substring(0, 500)}` : ''}` }],
                CLASSIFIER_SYSTEM_PROMPT,
                { model: 'gemini-3.1-flash-lite-preview', temperature: 0.1, maxTokens: 256 }
            );

            const reader = result.stream.getReader();
            const decoder = new TextDecoder();
            let raw = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                raw += decoder.decode(value, { stream: true });
            }

            const match = raw.match(/\{[\s\S]*\}/);
            if (!match) throw new Error('No JSON in classifier response');

            const parsed = JSON.parse(match[0]);
            taskType = (parsed.taskType as TaskType) || 'unknown';
            classifierConfidence = parsed.confidence ?? 0.7;
            classifierReasoning = parsed.reasoning || 'Classified by Gemini Flash router';
        } catch (err) {
            console.error('[AgentRouter] Classification failed:', err);
            taskType = 'unknown';
            classifierConfidence = 0.3;
            classifierReasoning = 'Classification failed — defaulting to Gemini Flash';
        }

        // Determine static target from routing table
        const staticTarget = ROUTING_TABLE[taskType] ?? 'gemini-flash';

        // Apply confidence override for flexible task types
        // Tool nodes are never confidence-overridden — they bypass this block entirely.
        if (memorySignal && CONFIDENCE_OVERRIDABLE.has(taskType) && !isToolNode(staticTarget)) {
            // Bug fix: fall back to staticTarget if tier key is missing from map (future-proof)
            const confidenceTarget =
                CONFIDENCE_TIER_TO_NODE[memorySignal.recommendedTier] ?? staticTarget;
            const overrideApplied = confidenceTarget !== staticTarget;

            if (overrideApplied) {
                // Bug fix: determine direction by comparing actual node cost ranks,
                // not by confidence score alone. A quality_analysis at 0.70 routes
                // claude→deepseek which is a downgrade, not an upgrade.
                const staticRank = LLM_NODE_COST_RANK[staticTarget] ?? 1;
                const confidenceRank = LLM_NODE_COST_RANK[confidenceTarget] ?? 1;
                const direction =
                    confidenceRank > staticRank
                        ? `upgraded to more capable model (ctx_conf=${memorySignal.contextConfidence.toFixed(3)} < 0.50)`
                        : confidenceRank < staticRank
                            ? `downgraded to faster model (ctx_conf=${memorySignal.contextConfidence.toFixed(3)} > 0.85)`
                            : `remapped (same tier, ctx_conf=${memorySignal.contextConfidence.toFixed(3)})`;

                console.log(
                    `[AgentRouter] Confidence override: ${staticTarget} → ${confidenceTarget} (${direction})`
                );
            }

            return {
                taskType,
                targetNode: confidenceTarget,
                confidence: classifierConfidence,
                reasoning: overrideApplied
                    ? `${classifierReasoning} [confidence override: ctx=${memorySignal.contextConfidence.toFixed(2)} → ${memorySignal.recommendedTier}]`
                    : classifierReasoning,
                jklawWebhook: confidenceTarget === 'jklaw',
                memorySignal,
                confidenceOverride: overrideApplied,
                allowDestructiveActions: task.allowDestructiveActions ?? false,
                source: 'llm_routing' as const,
            };
        }

        return {
            taskType,
            targetNode: staticTarget,
            confidence: classifierConfidence,
            reasoning: classifierReasoning,
            jklawWebhook: staticTarget === 'jklaw',
            ...(memorySignal ? { memorySignal, confidenceOverride: false } : {}),
            allowDestructiveActions: task.allowDestructiveActions ?? false,
            source: 'llm_routing' as const,
        };
    }

    // ─── Dispatch to JKlaw ───────────────────────────────────────────────

    async dispatchToJKlaw(
        task: AgentRouterTask,
        decision: RoutingDecision,
        waitForResponse = false
    ): Promise<{ dispatched: boolean; response?: string; error?: string }> {
        if (!this.jklawKey) {
            return { dispatched: false, error: 'JKLAW_API_KEY not configured' };
        }

        // Tenant scope guard — never dispatch without a userId
        if (!task.userId) {
            console.error('[AgentRouter] dispatchToJKlaw called without userId — blocking dispatch');
            return { dispatched: false, error: 'Missing userId: tenant scope violation' };
        }

        const payload = {
            action: 'chat',
            prompt: task.query,
            messages: [],
            // Tenant identity — validated by JKlaw endpoint on receipt
            userId: task.userId,
            _routingContext: {
                taskType: decision.taskType,
                reasoning: decision.reasoning,
                confidence: decision.confidence,
                callerContext: task.context?.substring(0, 500),
                allowDestructiveActions: decision.allowDestructiveActions ?? false,
                memorySignal: decision.memorySignal
                    ? {
                        contextConfidence: decision.memorySignal.contextConfidence,
                        recommendedTier: decision.memorySignal.recommendedTier,
                        factCount: decision.memorySignal.factCount,
                    }
                    : undefined,
                // Goal ancestry — gives JKlaw the "why" behind this task (T-007)
                goalContext: task.goalContext
                    ? {
                        currentGoal: task.goalContext.currentGoal,
                        recentTopics: task.goalContext.recentTopics?.slice(0, 5),
                        userTier: task.goalContext.userTier,
                        sessionIntent: task.goalContext.sessionIntent,
                    }
                    : undefined,
            },
        };

        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), waitForResponse ? 25000 : 5000);

            const res = await fetch(this.jklawUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-JKlaw-Key': this.jklawKey,
                    'X-UCOL-Route': decision.taskType,
                    ...(decision.memorySignal
                        ? { 'X-UCOL-Confidence': decision.memorySignal.contextConfidence.toFixed(3) }
                        : {}),
                },
                body: JSON.stringify(payload),
                signal: controller.signal,
            });

            clearTimeout(timeout);

            if (!res.ok) {
                return { dispatched: false, error: `JKlaw returned ${res.status}` };
            }

            if (waitForResponse) {
                const data = await res.json();
                return { dispatched: true, response: data.response };
            }

            return { dispatched: true };
        } catch (err: any) {
            if (err.name === 'AbortError') {
                return { dispatched: true };
            }
            return { dispatched: false, error: err.message };
        }
    }

    // ─── Full route + execute ────────────────────────────────────────────

    async route(task: AgentRouterTask): Promise<AgentRouterResult> {
        const decision = await this.classify(task);

        const confLabel = decision.memorySignal
            ? `, ctx_conf=${decision.memorySignal.contextConfidence.toFixed(2)}, tier=${decision.memorySignal.recommendedTier}`
            : '';

        console.log(
            `[AgentRouter] "${task.query.substring(0, 60)}" → ${decision.targetNode}` +
            ` (type=${decision.taskType}, clf_conf=${decision.confidence.toFixed(2)}${confLabel}` +
            `${decision.confidenceOverride ? ', ⚡ confidence_override' : ''})`
        );

        if (decision.targetNode === 'jklaw') {
            const waitForResponse = decision.taskType === 'research' || decision.taskType === 'strategy';
            const result = await this.dispatchToJKlaw(task, decision, waitForResponse);
            return { decision, response: result.response, dispatched: result.dispatched, error: result.error };
        }

        return { decision };
    }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let _router: AgentRouter | null = null;

export function getAgentRouter(): AgentRouter {
    if (!_router) _router = new AgentRouter();
    return _router;
}

/**
 * Quick-classify a query without full routing.
 * Pass memoryFacts to enable confidence-aware classification.
 * userId defaults to 'system' for internal classification calls.
 */
export async function classifyQuery(
    query: string,
    context?: string,
    memoryFacts?: ExtractedFact[],
    userId: string = 'system'
): Promise<RoutingDecision> {
    const router = getAgentRouter();
    return router.classify({ query, context, memoryFacts, userId });
}
