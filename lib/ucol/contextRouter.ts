// lib/ucol/contextRouter.ts
// lib/ucol/contextRouter.ts
// Core UCOL Context Router — orchestrates the debate loop with dynamic model routing.
//
// Model routing:
//   - Gemini plans
//   - ModelRouter selects coder per-component from open-weight fleet
//   - Gemini reviews
//   - Automatic escalation on token pressure / thrash / semantic complexity

import * as fs from 'fs';
import * as path from 'path';

import { generatePlan } from './prompts/kimiPlanner';
import { kimiCoderProvider } from './prompts/kimiCoder';
import { geminiCoderProvider } from './prompts/geminiCoder';
import { reviewCode } from './prompts/kimiReviewer';
import { logEvent } from '@/lib/telemetry';
import { ModelRouter } from './modelRouter';
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
const ORIGINALITY_THRESHOLD = 4;
const PRAGMATISM_THRESHOLD = 5;
const COMPONENT_TIMEOUT_MS = 25_000;
// Kimi K3 on NVIDIA NIM routinely takes 30-60s for a full component.
const PROVIDER_TIMEOUT_MS = 90_000;

// ── Constraint Tracking ──────────────────────────────────────────────────────
// Prevents ping-ponging between opposing constraints by tracking which
// constraints have been applied and tagging them with semantic metadata.

interface Constraint {
    text: string;
    type: 'complexity' | 'simplicity';
    target: 'originality' | 'pragmatism';
}

const CONSTRAINTS: Constraint[] = [
    // Complexity constraints (boost originality)
    { text: 'Extract at least one reusable custom hook that encapsulates the core logic of this component', type: 'complexity', target: 'originality' },
    { text: 'Handle at least 3 edge cases NOT mentioned in the spec (empty state, error state, loading, overflow, accessibility, etc.)', type: 'complexity', target: 'originality' },
    { text: 'Use useReducer instead of useState for the primary state management — model the state transitions explicitly', type: 'complexity', target: 'originality' },
    { text: 'Implement the component using a compound pattern (Provider + sub-components) instead of monolithic props', type: 'complexity', target: 'originality' },
    { text: 'Add at least 2 defensive type guards and make all external data access null-safe', type: 'complexity', target: 'originality' },
    { text: 'Extract a utility or helper module that this component uses — it should be independently testable', type: 'complexity', target: 'originality' },
    // Simplicity constraints (boost pragmatism)
    { text: 'REMOVE over-engineered abstractions. Do NOT use useReducer or compound components for this simple UI element.', type: 'simplicity', target: 'pragmatism' },
    { text: 'Simplify the state management. Remove unnecessary useMemo/useCallback hooks and consolidate state.', type: 'simplicity', target: 'pragmatism' },
    { text: 'Reduce the code footprint. This component is bloated. Implement only what is necessary for the spec.', type: 'simplicity', target: 'pragmatism' },
    { text: 'Remove "enterprisey" patterns like exponential backoff or overly generic type factories for this basic component.', type: 'simplicity', target: 'pragmatism' },
];

function selectConstraint(
    session: BuildSession,
    componentName: string,
    target: 'originality' | 'pragmatism'
): Constraint | undefined {
    // Get previously applied constraints for this component
    const applied = new Set(
        session.refinementLog
            ?.filter(r => r.component === componentName)
            .map(r => r.constraint)
            .filter(Boolean) ?? []
    );

    // Filter: don't re-apply, don't oppose last applied
    const candidates = CONSTRAINTS.filter(c => {
        if (applied.has(c.text)) return false;
        if (c.target !== target) return false;
        // Don't apply simplicity right after complexity (or vice versa)
        const lastApplied = session.refinementLog?.slice(-1)[0];
        if (lastApplied && lastApplied.constraintType === 'complexity' && c.type === 'simplicity') return false;
        if (lastApplied && lastApplied.constraintType === 'simplicity' && c.type === 'complexity') return false;
        return true;
    });

    if (candidates.length === 0) return undefined;

    // Deterministic selection: pick first unused constraint of target type
    return candidates[0];
}

export class ContextRouter {
    private onContextFlow: ContextFlowCallback;
    private installedDependencies: string[];
    private providerKeys: ProviderApiKeys;
    private modelRouter: ModelRouter;

    constructor(options: ContextRouterOptions) {
        this.onContextFlow = options.onContextFlow;
        this.installedDependencies = this.getInstalledDependencies();
        this.providerKeys = options.providerKeys ?? {};
        this.modelRouter = new ModelRouter(options.onContextFlow);
    }

    private getInstalledDependencies(): string[] {
        try {
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
            target: 'ucol',
            action: `Plan ready: ${plan.appName} (${plan.components.length} components)`,
            reasoning: plan.reasoning,
            status: 'complete',
        });

        return plan;
    }

    async generateCode(plan: ProjectPlan, session: BuildSession, fast = false): Promise<GeneratedFile[]> {
        const buildOrder = this.resolveBuildOrder(plan.components);
        const tiers = this.groupIntoTiers(buildOrder);
        const allFiles: GeneratedFile[] = [];

        for (const tier of tiers) {
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

    private withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
        return Promise.race([
            promise,
            new Promise<T>((_, reject) =>
                setTimeout(() => reject(new Error(`Timeout: ${label} exceeded ${ms}ms`)), ms)
            ),
        ]);
    }

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

        // Build prompt text for router token estimation
        const dependencyText = dependencies.map(f => `### ${f.path}\n\`\`\`${f.language}\n${f.content}\n\`\`\``).join('\n\n');
        const promptText = `${component.name} ${component.description} ${component.filePath} ${plan.description} ${plan.techStack.join(' ')} ${component.dependencies.join(' ')}\n${dependencyText}`;

        const routerDecision = this.modelRouter.decide(component, plan, session, promptText);
        const selectedModel = routerDecision.primaryModel;
        const modelIdForProvider = selectedModel.modelId;

        while (attempt < MAX_REVIEW_ATTEMPTS) {
            attempt++;

            this.emitContextFlow({
                id: crypto.randomUUID(),
                timestamp: Date.now(),
                source: 'ucol',
                target: selectedModel.provider,
                action: attempt === 1
                    ? `Generating ${component.name} on ${modelIdForProvider}`
                    : activeConstraint
                        ? `🎯 Revising ${component.name} with constraint (attempt ${attempt})`
                        : `Revising ${component.name} (attempt ${attempt})`,
                reasoning: routerDecision.reason,
                status: 'active',
            });

            const contextPackage: ContextPackage = {
                source: 'ucol',
                target: selectedModel.provider,
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

            // ── Step 1: Generate code with provider fallback sequence ──
            const primaryProvider = selectedModel.provider;
            const attemptedProviders: string[] = [];
            const providerErrors: string[] = [];

            // Fallback sequence: primary → Gemini if primary is NIM/DEGRADED.
            const providerSequence = [primaryProvider, 'gemini'].filter(
                (p, idx, arr) => p !== arr[idx - 1] // dedup consecutive
            );

            for (const provider of providerSequence) {
                attemptedProviders.push(provider);
                try {
                    const files = await this.withTimeout(
                        provider === primaryProvider
                            ? kimiCoderProvider.generateCode(contextPackage, refinement, session.discoveredPatterns)
                            : geminiCoderProvider.generateCode(contextPackage, refinement, session.discoveredPatterns),
                        PROVIDER_TIMEOUT_MS,
                        component.name
                    );

                    if (files && files.length > 0) {
                        latestFiles = files;
                        if (provider !== primaryProvider) {
                            this.emitContextFlow({
                                id: crypto.randomUUID(),
                                timestamp: Date.now(),
                                source: primaryProvider,
                                target: provider,
                                action: `↪ Fell back to ${provider} for ${component.name}`,
                                reasoning: 'Primary provider failed; auto-failed-over to Gemini.',
                                status: 'complete',
                            });
                        }
                        break;
                    }
                } catch (err: any) {
                    const reason = err.message?.substring(0, 120) || 'Unknown error';
                    providerErrors.push(`[${provider}]: ${reason}`);
                    this.modelRouter.recordThrash(component.name);
                    this.emitContextFlow({
                        id: crypto.randomUUID(),
                        timestamp: Date.now(),
                        source: provider,
                        target: 'ucol',
                        action: `✗ ${provider} failed for ${component.name}`,
                        reasoning: reason,
                        status: 'error',
                    });
                }
            }

            if (!latestFiles || latestFiles.length === 0) {
                const sequence = attemptedProviders.join(' -> ');
                const errors = providerErrors.join('\n');
                // Emit component-error event so the route stream stays alive.
                this.emitContextFlow({
                    id: crypto.randomUUID(),
                    timestamp: Date.now(),
                    source: 'ucol',
                    target: 'user',
                    action: `⚠ ${component.name} — generation failed`,
                    reasoning: `Exhausted providers: ${sequence}. Errors:\n${errors}`,
                    status: 'error',
                });
                continue; // skip review, move to next component
            }
            const currentCode = latestFiles.map(f => f.content).join('\n---\n');

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

            if (attempt > 1 && previousCode) {
                const similarity = this.computeSimilarity(previousCode, currentCode);
                if (similarity >= SIMILARITY_THRESHOLD) {
                    // Don't auto-approve on similarity if the previous round was
                    // rejected for correctness — the coder is stuck producing
                    // the same broken code.
                    const lastReview = feedbackHistory[feedbackHistory.length - 1];
                    const wasCorrectnessRejection = lastReview && lastReview.score < 7;

                    if (!wasCorrectnessRejection) {
                        this.emitContextFlow({
                            id: crypto.randomUUID(),
                            timestamp: Date.now(),
                            source: 'system',
                            target: 'user',
                            action: `⚡ Auto-approved ${component.name} (code unchanged after stylistic rejection)`,
                            reasoning: `Similarity ${(similarity * 100).toFixed(0)}% ≥ ${(SIMILARITY_THRESHOLD * 100).toFixed(0)}%`,
                            status: 'complete',
                        });
                        return latestFiles;
                    } else {
                        this.emitContextFlow({
                            id: crypto.randomUUID(),
                            timestamp: Date.now(),
                            source: 'system',
                            target: 'user',
                            action: `⚠ Coder stuck — similarity high but previous rejection was for correctness. Continuing review.`,
                            reasoning: `Similarity ${(similarity * 100).toFixed(0)}% but last score was ${lastReview.score}/10`,
                            status: 'active',
                        });
                    }
                }
            }

            previousCode = currentCode;

            // ── Step 2: Gemini reviews ──
            this.emitContextFlow({
                id: crypto.randomUUID(),
                timestamp: Date.now(),
                source: selectedModel.provider,
                target: 'gemini',
                action: `Reviewing ${component.name}...`,
                reasoning: 'Evaluating correctness, originality, AND pragmatism',
                status: 'active',
            });

            session.reviewRounds++;
            let review: ReviewFeedback;
            try {
                review = await reviewCode(latestFiles, component, plan, this.providerKeys, {
                    userPrompt: session.userPrompt,
                    dependencyFiles: dependencies,
                    previousReviews: feedbackHistory,
                });
            } catch (reviewErr: any) {
                // Reviewer hard-fail: code did NOT pass the gate. Do not ship unverified code.
                this.emitContextFlow({
                    id: crypto.randomUUID(),
                    timestamp: Date.now(),
                    source: 'gemini',
                    target: 'user',
                    action: `✗ ${component.name} — reviewer failed: ${reviewErr.message?.substring(0, 100)}`,
                    reasoning: 'Code gate failed — reviewer could not verify code. Component rejected.',
                    status: 'error',
                });
                throw new Error(`Code gate failed for ${component.name}: ${reviewErr.message}`);
            }

            // ── Step 3: Novel pattern extraction ──
            if (review.originalityScore >= 7 && review.novelPatterns.length > 0) {
                for (const pattern of review.novelPatterns) {
                    session.discoveredPatterns.push({
                        component: component.name,
                        pattern,
                        example: pattern,
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
            const isOriginalityIssue = review.score >= 7 && review.originalityScore < ORIGINALITY_THRESHOLD;
            const isPragmatismIssue = review.score >= 7 && review.pragmatismScore < PRAGMATISM_THRESHOLD;

            if (review.approved && !isPragmatismIssue) {
                this.emitContextFlow({
                    id: crypto.randomUUID(),
                    timestamp: Date.now(),
                    source: 'gemini',
                    target: 'user',
                    action: `✓ ${component.name} (correct: ${review.score}/10, original: ${review.originalityScore}/10, pragmatism: ${review.pragmatismScore}/10)`,
                    reasoning: review.originalityNotes || review.critique || 'Meets quality criteria',
                    status: 'complete',
                });

                // Telemetry: debate loop accepted
                logEvent({
                    eventType: 'debate_loop_accepted',
                    workspaceId: session.userId,
                    metadata: {
                        component: component.name,
                        attempts: attempt,
                        finalScore: review.score,
                        reviewRounds: session.reviewRounds,
                    },
                });

                return latestFiles;
            }

            feedbackHistory.push(review);

            if (isPragmatismIssue && !activeConstraint) {
                const constraint = selectConstraint(session, component.name, 'pragmatism');
                if (constraint) {
                    activeConstraint = constraint.text;
                    session.constraintRounds++;
                    session.refinementLog.push({
                        component: component.name,
                        constraint: constraint.text,
                        constraintType: constraint.type,
                        appliedAt: Date.now(),
                    });

                    this.emitContextFlow({
                        id: crypto.randomUUID(),
                        timestamp: Date.now(),
                        source: 'gemini',
                        target: selectedModel.provider,
                        action: `🎯 Simplicity constraint for ${component.name}`,
                        reasoning: `Over-engineered! ${activeConstraint}`,
                        status: 'active',
                    });
                }
            } else if (isOriginalityIssue && !activeConstraint) {
                const constraint = selectConstraint(session, component.name, 'originality');
                if (constraint) {
                    activeConstraint = constraint.text;
                    session.constraintRounds++;
                    session.refinementLog.push({
                        component: component.name,
                        constraint: constraint.text,
                        constraintType: constraint.type,
                        appliedAt: Date.now(),
                    });

                    this.emitContextFlow({
                        id: crypto.randomUUID(),
                        timestamp: Date.now(),
                        source: 'gemini',
                        target: selectedModel.provider,
                        action: `🎯 Creativity constraint for ${component.name}`,
                        reasoning: activeConstraint,
                        status: 'active',
                    });
                }
            } else {
                this.emitContextFlow({
                    id: crypto.randomUUID(),
                    timestamp: Date.now(),
                    source: 'gemini',
                    target: selectedModel.provider,
                    action: `✗ Rejected ${component.name} (attempt ${attempt}/${MAX_REVIEW_ATTEMPTS})`,
                    reasoning: review.critique,
                    status: attempt < MAX_REVIEW_ATTEMPTS ? 'active' : 'error',
                });
            }

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

    private computeSimilarity(a: string, b: string): number {
        const linesA = new Set(a.split('\n').map(l => l.trim()).filter(l => l.length > 0));
        const linesB = new Set(b.split('\n').map(l => l.trim()).filter(l => l.length > 0));

        if (linesA.size === 0 && linesB.size === 0) return 1;
        if (linesA.size === 0 || linesB.size === 0) return 0;

        let intersection = 0;
        const iteratorB = Array.from(linesB);
        for (const line of linesA) {
            if (iteratorB.includes(line)) intersection++;
        }

        const union = linesA.size + linesB.size - intersection;
        return union === 0 ? 0 : intersection / union;
    }

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
