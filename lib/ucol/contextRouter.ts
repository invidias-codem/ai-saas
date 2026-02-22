// lib/ucol/contextRouter.ts
// Core UCOL Context Router — orchestrates context flow between Gemini (planner),
// Claude (coder), and Gemini (reviewer) in a debate loop.
// Instantiated per-request to prevent cross-contamination of session state.

import { generatePlan } from './prompts/geminiPlanner';
import { generateComponent } from './prompts/claudeCoder';
import { generateComponentGemini } from './prompts/geminiCoder';
import { reviewCode } from './prompts/geminiReviewer';
import type {
    ProjectPlan,
    ComponentSpec,
    GeneratedFile,
    ContextPackage,
    ContextFlowEntry,
    BuildSession,
    ReviewFeedback,
    RefinementContext,
} from './types';

type ContextFlowCallback = (entry: ContextFlowEntry) => void;

interface ContextRouterOptions {
    onContextFlow: ContextFlowCallback;
}

const MAX_REVIEW_ATTEMPTS = 3;
const SIMILARITY_THRESHOLD = 0.95; // If code is >95% similar, auto-approve (coder disagrees)

export class ContextRouter {
    private onContextFlow: ContextFlowCallback;

    constructor(options: ContextRouterOptions) {
        this.onContextFlow = options.onContextFlow;
    }

    // ─── Phase 1: Route user prompt → Gemini for planning ───

    async planProject(prompt: string, session: BuildSession): Promise<ProjectPlan> {
        // Emit: user → gemini routing
        this.emitContextFlow({
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            source: 'user',
            target: 'gemini',
            action: 'Analyzing requirements...',
            reasoning: 'Routing user prompt to Gemini for architectural planning',
            status: 'active',
        });

        const contextPackage: ContextPackage = {
            source: 'user',
            target: 'gemini',
            payload: {
                type: 'plan',
                content: { prompt, userId: session.userId },
                reasoning: 'User requested new app — routing to Gemini for architectural planning',
                relevanceScore: 1.0,
            },
            timestamp: Date.now(),
            sessionId: session.id,
        };

        const plan = await generatePlan(contextPackage);

        // Emit: planning complete
        this.emitContextFlow({
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            source: 'gemini',
            target: 'claude',
            action: `Plan ready: ${plan.appName} (${plan.components.length} components)`,
            reasoning: plan.reasoning,
            status: 'complete',
        });

        return plan;
    }

    // ─── Phase 2: Route plan → Claude for code generation with Gemini review loop ───

    async generateCode(plan: ProjectPlan, session: BuildSession): Promise<GeneratedFile[]> {
        const files: GeneratedFile[] = [];
        const buildOrder = this.resolveBuildOrder(plan.components);

        for (const component of buildOrder) {
            // Gather already-generated dependency files
            const dependencies = files.filter(f =>
                component.dependencies.includes(f.component)
            );

            const componentFiles = await this.generateAndReviewComponent(
                component,
                plan,
                dependencies,
                session
            );

            files.push(...componentFiles);
        }

        return files;
    }

    // ─── The Debate Loop: Claude writes → Gemini reviews → repeat until approved ───

    private async generateAndReviewComponent(
        component: ComponentSpec,
        plan: ProjectPlan,
        dependencies: GeneratedFile[],
        session: BuildSession
    ): Promise<GeneratedFile[]> {
        let attempt = 0;
        let feedbackHistory: ReviewFeedback[] = [];
        let previousCode = '';
        let latestFiles: GeneratedFile[] = [];

        while (attempt < MAX_REVIEW_ATTEMPTS) {
            attempt++;

            // ── Step 1: Claude generates code ──
            this.emitContextFlow({
                id: crypto.randomUUID(),
                timestamp: Date.now(),
                source: attempt === 1 ? 'gemini' : 'gemini',
                target: 'claude',
                action: attempt === 1
                    ? `Generating ${component.name}...`
                    : `Revising ${component.name} (attempt ${attempt})...`,
                reasoning: attempt === 1
                    ? `Building ${component.name} — depends on [${component.dependencies.join(', ') || 'none'}]`
                    : `Gemini rejected: ${feedbackHistory[feedbackHistory.length - 1]?.critique.substring(0, 80) || 'unknown'}`,
                status: 'active',
            });

            const contextPackage: ContextPackage = {
                source: 'gemini',
                target: 'claude',
                payload: {
                    type: attempt === 1 ? 'code' : 'refinement',
                    content: {
                        component,
                        fullPlan: plan,
                        existingFiles: dependencies,
                        techStack: plan.techStack,
                    },
                    reasoning: `Building ${component.name} — attempt ${attempt}/${MAX_REVIEW_ATTEMPTS}`,
                    relevanceScore: 1.0,
                },
                timestamp: Date.now(),
                sessionId: session.id,
            };

            // Build refinement context for attempts > 1
            const refinement: RefinementContext | undefined = attempt > 1
                ? {
                    attempt,
                    previousCode,
                    feedbackHistory, // FULL chain, not just latest
                    component,
                }
                : undefined;

            // Try Claude first, fall back to Gemini on failure
            try {
                latestFiles = await generateComponent(contextPackage, refinement);
            } catch (claudeErr: any) {
                console.warn(`[UCOL] Claude failed: ${claudeErr.message} — falling back to Gemini coder`);
                this.emitContextFlow({
                    id: crypto.randomUUID(),
                    timestamp: Date.now(),
                    source: 'system',
                    target: 'gemini',
                    action: `⚡ Claude unavailable — falling back to Gemini coder`,
                    reasoning: claudeErr.message?.substring(0, 100) || 'Unknown error',
                    status: 'active',
                });
                latestFiles = await generateComponentGemini(contextPackage, refinement);
            }
            const currentCode = latestFiles.map(f => f.content).join('\n---\n');

            // ── Similarity escape hatch ──
            // If Claude's revision is >95% similar to previous, it's saying "I disagree, this is correct"
            if (attempt > 1 && previousCode) {
                const similarity = this.computeSimilarity(previousCode, currentCode);
                if (similarity >= SIMILARITY_THRESHOLD) {
                    this.emitContextFlow({
                        id: crypto.randomUUID(),
                        timestamp: Date.now(),
                        source: 'system',
                        target: 'user',
                        action: `⚡ Auto-approved ${component.name} (code unchanged — coder stands by it)`,
                        reasoning: `Similarity ${(similarity * 100).toFixed(0)}% ≥ ${(SIMILARITY_THRESHOLD * 100).toFixed(0)}% — forcing approval`,
                        status: 'complete',
                    });
                    return latestFiles;
                }
            }

            previousCode = currentCode;

            // ── Step 2: Gemini reviews Claude's code ──
            this.emitContextFlow({
                id: crypto.randomUUID(),
                timestamp: Date.now(),
                source: 'claude',
                target: 'gemini',
                action: `Reviewing ${component.name}...`,
                reasoning: `Code generated for ${component.name} — routing to Gemini QA reviewer`,
                status: 'active',
            });

            session.reviewRounds++;

            const review = await reviewCode(latestFiles, component, plan);

            // ── Step 3: Decision ──
            if (review.approved) {
                // ✓ Approved
                this.emitContextFlow({
                    id: crypto.randomUUID(),
                    timestamp: Date.now(),
                    source: 'gemini',
                    target: 'user',
                    action: `✓ ${component.name} approved (score: ${review.score}/10)`,
                    reasoning: review.critique || 'Code meets all quality criteria',
                    status: 'complete',
                });
                return latestFiles;
            }

            // ✗ Rejected — add to feedback history  
            feedbackHistory.push(review);

            this.emitContextFlow({
                id: crypto.randomUUID(),
                timestamp: Date.now(),
                source: 'gemini',
                target: 'claude',
                action: `✗ Rejected ${component.name} (score: ${review.score}/10, attempt ${attempt}/${MAX_REVIEW_ATTEMPTS})`,
                reasoning: review.critique,
                status: attempt < MAX_REVIEW_ATTEMPTS ? 'active' : 'error',
            });

            // If this was the last attempt, force-accept
            if (attempt >= MAX_REVIEW_ATTEMPTS) {
                this.emitContextFlow({
                    id: crypto.randomUUID(),
                    timestamp: Date.now(),
                    source: 'system',
                    target: 'user',
                    action: `⚠ Force-accepted ${component.name} after ${MAX_REVIEW_ATTEMPTS} attempts`,
                    reasoning: `Max review attempts reached. Last score: ${review.score}/10. Issues: ${review.failedCriteria.join(', ') || 'none flagged'}`,
                    status: 'complete',
                });
                return latestFiles;
            }
        }

        // Fallback (shouldn't reach here, but TypeScript needs it)
        return latestFiles;
    }

    // ─── Similarity Detection ───
    // Simple Jaccard similarity on lines — good enough to catch "identical code" cases

    private computeSimilarity(a: string, b: string): number {
        const linesA = new Set(a.split('\n').map(l => l.trim()).filter(l => l.length > 0));
        const linesB = new Set(b.split('\n').map(l => l.trim()).filter(l => l.length > 0));

        if (linesA.size === 0 && linesB.size === 0) return 1;
        if (linesA.size === 0 || linesB.size === 0) return 0;

        let intersection = 0;
        for (const line of linesA) {
            if (linesB.has(line)) intersection++;
        }

        const union = new Set([...linesA, ...linesB]).size;
        return union === 0 ? 0 : intersection / union;
    }

    // ─── Dependency Resolution (Topological Sort — Kahn's Algorithm) ───

    resolveBuildOrder(components: ComponentSpec[]): ComponentSpec[] {
        const componentMap = new Map(components.map(c => [c.name, c]));
        const inDegree = new Map<string, number>();
        const adjList = new Map<string, string[]>();

        // Initialize
        for (const comp of components) {
            // Only count dependencies that actually exist in our component list
            const validDeps = comp.dependencies.filter(d => componentMap.has(d));
            inDegree.set(comp.name, validDeps.length);

            for (const dep of validDeps) {
                if (!adjList.has(dep)) adjList.set(dep, []);
                adjList.get(dep)!.push(comp.name);
            }
        }

        const queue = components.filter(c => (inDegree.get(c.name) ?? 0) === 0);
        const result: ComponentSpec[] = [];

        while (queue.length > 0) {
            const current = queue.shift()!;
            result.push(current);

            for (const neighbor of adjList.get(current.name) || []) {
                const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
                inDegree.set(neighbor, newDegree);
                if (newDegree === 0) {
                    const comp = componentMap.get(neighbor);
                    if (comp) queue.push(comp);
                }
            }
        }

        // If topological sort didn't include everything (cycle), append remaining
        if (result.length < components.length) {
            const sorted = new Set(result.map(r => r.name));
            for (const comp of components) {
                if (!sorted.has(comp.name)) result.push(comp);
            }
        }

        return result;
    }

    // ─── Internal ───

    private emitContextFlow(entry: ContextFlowEntry) {
        this.onContextFlow(entry);
    }
}
