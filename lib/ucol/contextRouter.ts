// lib/ucol/contextRouter.ts
// Core UCOL Context Router — orchestrates the debate loop between:
//   Gemini (planner) → Claude (coder) → Gemini (reviewer)
// With pattern evolution: novel patterns discovered in earlier components
// are injected into later components. Low-originality code gets
// constraint-forced revisions.

import * as fs from 'fs';
import * as path from 'path';

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
    DiscoveredPattern,
} from './types';
import type { ProviderApiKeys } from '@/lib/userProviderKeys';

type ContextFlowCallback = (entry: ContextFlowEntry) => void;

interface ContextRouterOptions {
    onContextFlow: ContextFlowCallback;
    providerKeys?: ProviderApiKeys;
}

const MAX_REVIEW_ATTEMPTS = 3;
const SIMILARITY_THRESHOLD = 0.95;
const ORIGINALITY_THRESHOLD = 4; // Score below this triggers a creativity constraint
const PRAGMATISM_THRESHOLD = 5;  // Score below this triggers a simplicity constraint

// Per-component generation timeout (ms) — fall back to Gemini coder if exceeded
const COMPONENT_TIMEOUT_MS = 25_000;

// Creativity constraints — one is chosen randomly when originality is low
const CREATIVITY_CONSTRAINTS = [
    'Extract at least one reusable custom hook that encapsulates the core logic of this component',
    'Handle at least 3 edge cases NOT mentioned in the spec (empty state, error state, loading, overflow, accessibility, etc.)',
    'Use useReducer instead of useState for the primary state management — model the state transitions explicitly',
    'Implement the component using a compound pattern (Provider + sub-components) instead of monolithic props',
    'Add at least 2 defensive type guards and make all external data access null-safe',
    'Extract a utility or helper module that this component uses — it should be independently testable',
];

// Simplicity constraints — one is chosen when pragmatism is low (over-engineered)
const SIMPLICITY_CONSTRAINTS = [
    'REMOVE over-engineered abstractions. Do NOT use useReducer or compound components for this simple UI element.',
    'Simplify the state management. Remove unnecessary useMemo/useCallback hooks and consolidate state.',
    'Reduce the code footprint. This component is bloated. Implement only what is necessary for the spec.',
    'Remove "enterprisey" patterns like exponential backoff or overly generic type factories for this basic component.',
];

export class ContextRouter {
    private onContextFlow: ContextFlowCallback;
    private installedDependencies: string[];
    private providerKeys: ProviderApiKeys;

    constructor(options: ContextRouterOptions) {
        this.onContextFlow = options.onContextFlow;
        this.installedDependencies = this.getInstalledDependencies();
        this.providerKeys = options.providerKeys ?? {};
    }

    // ─── Read installed dependencies from package.json ───

    private getInstalledDependencies(): string[] {
        try {
            // Walk up from cwd to find the nearest package.json
            const pkgPath = path.resolve(process.cwd(), 'package.json');
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
            return [
                ...Object.keys(pkg.dependencies || {}),
                ...Object.keys(pkg.devDependencies || {}),
            ];
        } catch {
            console.warn('[UCOL] Could not read package.json — dependency constraints disabled');
            return [];
        }
    }

    // ─── Phase 1: Route user prompt → Gemini for planning ───

    async planProject(prompt: string, session: BuildSession): Promise<ProjectPlan> {
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
                content: {
                    prompt,
                    userId: session.userId,
                    availableDependencies: this.installedDependencies,
                },
                reasoning: 'User requested new app — routing to Gemini for architectural planning',
                relevanceScore: 1.0,
            },
            timestamp: Date.now(),
            sessionId: session.id,
        };

        const plan = await generatePlan(contextPackage, this.providerKeys);

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

    // ─── Phase 2: Route plan → Claude for code generation with review loop ───
    // Parallel execution: components with no shared deps run concurrently.
    // fast=true skips the Gemini review loop (single-pass generation).

    async generateCode(plan: ProjectPlan, session: BuildSession, fast = false): Promise<GeneratedFile[]> {
        const buildOrder = this.resolveBuildOrder(plan.components);
        const tiers = this.groupIntoTiers(buildOrder);
        const allFiles: GeneratedFile[] = [];

        for (const tier of tiers) {
            // All components in a tier are independent — run them in parallel
            const tierResults = await Promise.all(
                tier.map(component => {
                    const deps = allFiles.filter(f =>
                        component.dependencies.includes(f.component)
                    );
                    return this.generateAndReviewComponent(component, plan, deps, session, fast);
                })
            );

            for (const files of tierResults) {
                allFiles.push(...files);
            }
        }

        return allFiles;
    }

    // ─── Group topologically-sorted components into parallel tiers ───
    // Tier 0: no dependencies. Tier N: depends only on components in tiers 0..N-1.

    private groupIntoTiers(buildOrder: ComponentSpec[]): ComponentSpec[][] {
        const tierOf = new Map<string, number>();

        for (const component of buildOrder) {
            const depTiers = component.dependencies
                .filter(d => tierOf.has(d))
                .map(d => tierOf.get(d)!);
            const tier = depTiers.length > 0 ? Math.max(...depTiers) + 1 : 0;
            tierOf.set(component.name, tier);
        }

        const tiers: ComponentSpec[][] = [];
        for (const component of buildOrder) {
            const t = tierOf.get(component.name) ?? 0;
            if (!tiers[t]) tiers[t] = [];
            tiers[t].push(component);
        }

        return tiers;
    }

    // ─── Per-promise timeout helper ───

    private withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
        return Promise.race([
            promise,
            new Promise<T>((_, reject) =>
                setTimeout(() => reject(new Error(`Timeout: ${label} exceeded ${ms}ms`)), ms)
            ),
        ]);
    }

    // ─── The Debate Loop with Originality Pressure ───
    // fast=true: single-pass generation only (no Gemini review, no retries)

    private async generateAndReviewComponent(
        component: ComponentSpec,
        plan: ProjectPlan,
        dependencies: GeneratedFile[],
        session: BuildSession,
        fast = false
    ): Promise<GeneratedFile[]> {
        let attempt = 0;
        let feedbackHistory: ReviewFeedback[] = [];
        let previousCode = '';
        let latestFiles: GeneratedFile[] = [];
        let activeConstraint: string | undefined;

        while (attempt < MAX_REVIEW_ATTEMPTS) {
            attempt++;

            // ── Step 1: Generate code ──
            this.emitContextFlow({
                id: crypto.randomUUID(),
                timestamp: Date.now(),
                source: 'gemini',
                target: 'claude',
                action: attempt === 1
                    ? `Generating ${component.name}...`
                    : activeConstraint
                        ? `🎯 Revising ${component.name} with constraint (attempt ${attempt})...`
                        : `Revising ${component.name} (attempt ${attempt})...`,
                reasoning: attempt === 1
                    ? `Building ${component.name} — depends on [${component.dependencies.join(', ') || 'none'}]`
                    : activeConstraint
                        ? `Constraint: ${activeConstraint}`
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
                        availableDependencies: this.installedDependencies,
                    },
                    reasoning: `Building ${component.name} — attempt ${attempt}/${MAX_REVIEW_ATTEMPTS}`,
                    relevanceScore: 1.0,
                },
                timestamp: Date.now(),
                sessionId: session.id,
            };

            const refinement: RefinementContext | undefined = attempt > 1
                ? {
                    attempt,
                    previousCode,
                    feedbackHistory,
                    component,
                    constraint: activeConstraint,
                }
                : undefined;

            // Try Claude first (with timeout), fall back to Gemini
            try {
                latestFiles = await this.withTimeout(
                    generateComponent(contextPackage, refinement, session.discoveredPatterns, this.providerKeys),
                    COMPONENT_TIMEOUT_MS,
                    component.name
                );
            } catch (claudeErr: any) {
                const reason = claudeErr.message?.substring(0, 100) || 'Unknown error';
                console.warn(`[UCOL] Claude failed for ${component.name}: ${reason} — falling back to Gemini coder`);
                this.emitContextFlow({
                    id: crypto.randomUUID(),
                    timestamp: Date.now(),
                    source: 'system',
                    target: 'gemini',
                    action: `⚡ Claude timeout — falling back to Gemini coder for ${component.name}`,
                    reasoning: reason,
                    status: 'active',
                });
                latestFiles = await generateComponentGemini(
                    contextPackage, refinement, session.discoveredPatterns, this.providerKeys
                );
            }

            const currentCode = latestFiles.map(f => f.content).join('\n---\n');

            // ── Fast mode: skip review, return immediately ──
            if (fast) {
                this.emitContextFlow({
                    id: crypto.randomUUID(),
                    timestamp: Date.now(),
                    source: 'system',
                    target: 'user',
                    action: `⚡ ${component.name} generated (fast mode — no review)`,
                    reasoning: 'Fast mode: single-pass generation, no debate loop',
                    status: 'complete',
                });
                return latestFiles;
            }

            // ── Similarity escape hatch ──
            if (attempt > 1 && previousCode) {
                const similarity = this.computeSimilarity(previousCode, currentCode);
                if (similarity >= SIMILARITY_THRESHOLD) {
                    this.emitContextFlow({
                        id: crypto.randomUUID(),
                        timestamp: Date.now(),
                        source: 'system',
                        target: 'user',
                        action: `⚡ Auto-approved ${component.name} (code unchanged — coder stands by it)`,
                        reasoning: `Similarity ${(similarity * 100).toFixed(0)}% ≥ ${(SIMILARITY_THRESHOLD * 100).toFixed(0)}%`,
                        status: 'complete',
                    });
                    return latestFiles;
                }
            }

            previousCode = currentCode;

            // ── Step 2: Gemini reviews (3-axis) ──
            this.emitContextFlow({
                id: crypto.randomUUID(),
                timestamp: Date.now(),
                source: 'claude',
                target: 'gemini',
                action: `Reviewing ${component.name}...`,
                reasoning: `Evaluating correctness, originality, AND pragmatism`,
                status: 'active',
            });

            session.reviewRounds++;
            const review = await reviewCode(latestFiles, component, plan, this.providerKeys);

            // ── Step 3: Extract novel patterns (if high originality) ──
            if (review.originalityScore >= 7 && review.novelPatterns.length > 0) {
                for (const pattern of review.novelPatterns) {
                    session.discoveredPatterns.push({
                        component: component.name,
                        pattern,
                        example: pattern, // The pattern description itself serves as the example
                        originalityScore: review.originalityScore,
                    });
                }

                this.emitContextFlow({
                    id: crypto.randomUUID(),
                    timestamp: Date.now(),
                    source: 'gemini',
                    target: 'user',
                    action: `💡 Novel pattern${review.novelPatterns.length > 1 ? 's' : ''} discovered in ${component.name}`,
                    reasoning: review.novelPatterns.join(' | '),
                    status: 'complete',
                });
            }

            // ── Step 4: Decision ──

            // It only passes if Correctness >= 8 AND Pragmatism >= 5
            const isOriginalityIssue = review.score >= 7 && review.originalityScore < ORIGINALITY_THRESHOLD;
            const isPragmatismIssue = review.score >= 7 && review.pragmatismScore < PRAGMATISM_THRESHOLD;

            if (review.approved && !isPragmatismIssue) {
                // Check if originality is too low — impose constraint for next time
                // (but still accept this component since correctness/pragmatism passed)
                this.emitContextFlow({
                    id: crypto.randomUUID(),
                    timestamp: Date.now(),
                    source: 'gemini',
                    target: 'user',
                    action: `✓ ${component.name} (correct: ${review.score}/10, original: ${review.originalityScore}/10, pragmatism: ${review.pragmatismScore}/10)`,
                    reasoning: review.originalityNotes || review.critique || 'Meets quality criteria',
                    status: 'complete',
                });
                return latestFiles;
            }

            // ✗ Rejected
            feedbackHistory.push(review);

            if (isPragmatismIssue && !activeConstraint) {
                // Correctness is fine but it's OVER-ENGINEERED. Force a rewrite.
                activeConstraint = SIMPLICITY_CONSTRAINTS[
                    Math.floor(Math.random() * SIMPLICITY_CONSTRAINTS.length)
                ];
                session.constraintRounds++;

                this.emitContextFlow({
                    id: crypto.randomUUID(),
                    timestamp: Date.now(),
                    source: 'gemini',
                    target: 'claude',
                    action: `🎯 Simplicity constraint for ${component.name} (pragmatism: ${review.pragmatismScore}/10)`,
                    reasoning: `Over-engineered! ${activeConstraint}`,
                    status: 'active',
                });
            } else if (isOriginalityIssue && !activeConstraint) {
                // Correctness is fine but originality is low — impose a creativity constraint
                activeConstraint = CREATIVITY_CONSTRAINTS[
                    Math.floor(Math.random() * CREATIVITY_CONSTRAINTS.length)
                ];
                session.constraintRounds++;

                this.emitContextFlow({
                    id: crypto.randomUUID(),
                    timestamp: Date.now(),
                    source: 'gemini',
                    target: 'claude',
                    action: `🎯 Creativity constraint for ${component.name} (original: ${review.originalityScore}/10)`,
                    reasoning: activeConstraint,
                    status: 'active',
                });
            } else {
                this.emitContextFlow({
                    id: crypto.randomUUID(),
                    timestamp: Date.now(),
                    source: 'gemini',
                    target: 'claude',
                    action: `✗ Rejected ${component.name} (correct: ${review.score}/10, original: ${review.originalityScore}/10, pragmatism: ${review.pragmatismScore}/10, attempt ${attempt}/${MAX_REVIEW_ATTEMPTS})`,
                    reasoning: review.critique,
                    status: attempt < MAX_REVIEW_ATTEMPTS ? 'active' : 'error',
                });
            }

            // Force-accept on max attempts
            if (attempt >= MAX_REVIEW_ATTEMPTS) {
                this.emitContextFlow({
                    id: crypto.randomUUID(),
                    timestamp: Date.now(),
                    source: 'system',
                    target: 'user',
                    action: `⚠ Force-accepted ${component.name} after ${MAX_REVIEW_ATTEMPTS} attempts`,
                    reasoning: `Last scores: correct ${review.score}/10, original ${review.originalityScore}/10, pragmatism ${review.pragmatismScore}/10`,
                    status: 'complete',
                });
                return latestFiles;
            }
        }

        return latestFiles;
    }

    // ─── Similarity Detection (Jaccard on lines) ───

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

    // ─── Dependency Resolution (Topological Sort) ───

    resolveBuildOrder(components: ComponentSpec[]): ComponentSpec[] {
        const componentMap = new Map(components.map(c => [c.name, c]));
        const inDegree = new Map<string, number>();
        const adjList = new Map<string, string[]>();

        for (const comp of components) {
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

        if (result.length < components.length) {
            const sorted = new Set(result.map(r => r.name));
            for (const comp of components) {
                if (!sorted.has(comp.name)) result.push(comp);
            }
        }

        return result;
    }

    private emitContextFlow(entry: ContextFlowEntry) {
        this.onContextFlow(entry);
    }
}
