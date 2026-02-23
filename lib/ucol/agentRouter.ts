/**
 * lib/ucol/agentRouter.ts
 * 
 * UCOL Unified Agent Router
 * 
 * Classifies incoming tasks and routes them to the most capable node:
 * 
 *   gemini-flash  → fast answers, fact extraction, embeddings
 *   claude        → quality code generation, nuanced analysis
 *   deepseek      → deep reasoning, multi-step logic
 *   jklaw         → research, strategy, orchestration, co-founder thinking
 *   context-router → full Gemini→Claude→Gemini code builder pipeline
 * 
 * JKlaw is a first-class routing target for tasks that need:
 *   - multi-source research synthesis
 *   - strategic / product-level decisions
 *   - long-horizon planning
 *   - anything that benefits from persistent memory across sessions
 */

import { GeminiProvider } from '@/lib/llm/providers/gemini';

// ─── Task Classification ────────────────────────────────────────────────────

export type TaskType =
    | 'code_generation'      // → ContextRouter (Gemini→Claude→review loop)
    | 'quick_answer'         // → Gemini Flash
    | 'quality_analysis'     // → Claude
    | 'deep_reasoning'       // → DeepSeek R1
    | 'memory_extract'       // → MemoryRouter (Gemini)
    | 'memory_synthesize'    // → MemoryRouter (DeepSeek or Gemini)
    | 'user_profile'         // → MemoryRouter (Claude)
    | 'research'             // → JKlaw
    | 'strategy'             // → JKlaw
    | 'orchestration'        // → JKlaw
    | 'unknown';             // → Gemini Flash (fallback)

export interface RoutingDecision {
    taskType: TaskType;
    targetNode: 'gemini-flash' | 'claude' | 'deepseek' | 'jklaw' | 'context-router';
    confidence: number;      // 0.0 – 1.0
    reasoning: string;
    jklawWebhook?: boolean;  // if true, dispatch to JKlaw asynchronously
}

export interface AgentRouterTask {
    query: string;
    userId?: string;
    context?: string;        // additional context (previous messages, facts, etc.)
    preferSpeed?: boolean;   // hint: prioritize latency over quality
    requireOrchestration?: boolean; // hint: this task needs multi-step coordination
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
- unknown: Doesn't fit any category

Respond with ONLY a JSON object:
{
  "taskType": "<task_type>",
  "confidence": <0.0-1.0>,
  "reasoning": "<one sentence>"
}`;

// ─── Routing Rules ──────────────────────────────────────────────────────────

const ROUTING_TABLE: Record<TaskType, RoutingDecision['targetNode']> = {
    code_generation:   'context-router',
    quick_answer:      'gemini-flash',
    quality_analysis:  'claude',
    deep_reasoning:    'deepseek',
    memory_extract:    'gemini-flash',
    memory_synthesize: 'deepseek',
    user_profile:      'claude',
    research:          'jklaw',
    strategy:          'jklaw',
    orchestration:     'jklaw',
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
        // Fast-path overrides
        if (task.requireOrchestration) {
            return {
                taskType: 'orchestration',
                targetNode: 'jklaw',
                confidence: 1.0,
                reasoning: 'Caller explicitly requested orchestration',
                jklawWebhook: true,
            };
        }

        if (task.preferSpeed) {
            return {
                taskType: 'quick_answer',
                targetNode: 'gemini-flash',
                confidence: 0.8,
                reasoning: 'Speed preferred — routing to Gemini Flash',
            };
        }

        try {
            const result = await this.gemini.generateStream(
                [{ role: 'user', text: `Query: ${task.query}${task.context ? `\n\nContext: ${task.context.substring(0, 500)}` : ''}` }],
                CLASSIFIER_SYSTEM_PROMPT,
                { model: 'gemini-2.0-flash', temperature: 0.1, maxTokens: 256 }
            );

            const reader = result.stream.getReader();
            const decoder = new TextDecoder();
            let raw = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                raw += decoder.decode(value, { stream: true });
            }

            // Extract JSON from response
            const match = raw.match(/\{[\s\S]*\}/);
            if (!match) throw new Error('No JSON in classifier response');

            const parsed = JSON.parse(match[0]);
            const taskType: TaskType = parsed.taskType || 'unknown';
            const targetNode = ROUTING_TABLE[taskType] || 'gemini-flash';

            return {
                taskType,
                targetNode,
                confidence: parsed.confidence ?? 0.7,
                reasoning: parsed.reasoning || 'Classified by Gemini Flash router',
                jklawWebhook: targetNode === 'jklaw',
            };
        } catch (err) {
            console.error('[AgentRouter] Classification failed:', err);
            return {
                taskType: 'unknown',
                targetNode: 'gemini-flash',
                confidence: 0.3,
                reasoning: 'Classification failed — defaulting to Gemini Flash',
            };
        }
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

        const payload = {
            action: 'chat',
            prompt: task.query,
            messages: [],
            // Include routing context so JKlaw knows why it was called
            _routingContext: {
                taskType: decision.taskType,
                reasoning: decision.reasoning,
                confidence: decision.confidence,
                callerContext: task.context?.substring(0, 500),
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
                // Fire-and-forget timed out — that's fine for async dispatch
                return { dispatched: true };
            }
            return { dispatched: false, error: err.message };
        }
    }

    // ─── Full route + execute ────────────────────────────────────────────

    async route(task: AgentRouterTask): Promise<AgentRouterResult> {
        const decision = await this.classify(task);

        console.log(`[AgentRouter] ${task.query.substring(0, 60)} → ${decision.targetNode} (${decision.taskType}, conf=${decision.confidence.toFixed(2)})`);

        if (decision.targetNode === 'jklaw') {
            // For research/strategy/orchestration: dispatch to JKlaw
            // Wait for response for strategy (synchronous), fire-and-forget for orchestration
            const waitForResponse = decision.taskType === 'research' || decision.taskType === 'strategy';
            const result = await this.dispatchToJKlaw(task, decision, waitForResponse);

            return {
                decision,
                response: result.response,
                dispatched: result.dispatched,
                error: result.error,
            };
        }

        // For other nodes, return the decision and let the caller handle it
        // (MemoryRouter, ContextRouter, etc. handle their own execution)
        return { decision };
    }
}

// ─── Singleton helper ────────────────────────────────────────────────────────

let _router: AgentRouter | null = null;

export function getAgentRouter(): AgentRouter {
    if (!_router) _router = new AgentRouter();
    return _router;
}

/**
 * Quick-classify a query without full routing.
 * Useful for the conversationEngine to decide if JKlaw should be looped in.
 */
export async function classifyQuery(
    query: string,
    context?: string
): Promise<RoutingDecision> {
    const router = getAgentRouter();
    return router.classify({ query, context });
}
