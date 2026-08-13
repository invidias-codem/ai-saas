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

import { generatePlan } from './prompts/geminiPlanner';
import { generateComponent } from './prompts/claudeCoder';
import { generateComponentGemini } from './prompts/geminiCoder';
import { generateComponentOpenRouter } from './prompts/openRouterCoder';
import { generateComponentHuggingFace } from './prompts/huggingFaceCoder';
import { reviewCode } from './prompts/geminiReviewer';
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
const PROVIDER_TIMEOUT_MS = 15_000;

const CREATIVITY_CONSTRAINTS = [
    'Extract at least one reusable custom hook that encapsulates the core logic of this component',
    'Handle at least 3 edge cases NOT mentioned in the spec (empty state, error state, loading, overflow, accessibility, etc.)',
    'Use useReducer instead of useState for the primary state management — model the state transitions explicitly',
    'Implement the component using a compound pattern (Provider + sub-components) instead of monolithic props',
    'Add at least 2 defensive type guards and make all external data access null-safe',
    'Extract a utility or helper module that this component uses — it should be independently testable',
];

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

    private resolveModelIdForProvider(model: { provider: string; modelId: string; tier?: string; strengths?: string[]; contextLimit?: number; maxTokens?: number }): string {
        const candidate = (model.modelId || '').toLowerCase();

        const map: Record<string, string> = {
            huggingface: 'Qwen/Qwen3-Coder-480B-A35B-Instruct',
            openrouter: 'qwen/qwen3-coder-480b-a35b',
            anthropic: 'claude-sonnet-4-20250514',
            google: 'gemini-2.5-pro',
            together: 'Qwen/Qwen3-Coder-480B-A35B-Instruct',
            replicate: 'Qwen/Qwen3-Coder-480B-A35B-Instruct',
            openai: 'gpt-4o',
            nous: 'nousresearch/gpt-oss-120b',
        };

        const isAlreadyProviderCorrect =
            (model.provider === 'openrouter' && candidate.includes('/')) ||
            (model.provider === 'huggingface' && candidate.includes('/')) ||
            (model.provider === 'anthropic' && candidate.startsWith('claude-')) ||
            (model.provider === 'google' && candidate.startsWith('gemini-'));

        if (isAlreadyProviderCorrect) {
            return model.modelId;
        }

        const fallback = map[model.provider];
        if (!fallback) {
            return model.modelId;
        }

        if (model.provider === 'anthropic') {
            return 'claude-sonnet-4-20250514';
        }

        return fallback;
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
        const modelIdForProvider = this.resolveModelIdForProvider(selectedModel);

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

            // ── Step 1: Generate code with cascading multi-provider fallback ──
            const primaryProvider = selectedModel.provider;
            const attemptedProviders: string[] = [];
            const providerErrors: string[] = [];
            let generationError: string | undefined;

            const providerSequence = [
                primaryProvider,
                ...(primaryProvider !== 'huggingface' && (this.providerKeys.huggingface || process.env.HUGGINGFACE_API_KEY) ? ['huggingface'] : []),
                ...(primaryProvider !== 'openrouter' && (this.providerKeys.openrouter || process.env.OPENROUTER_API_KEY) ? ['openrouter'] : []),
                ...(primaryProvider !== 'anthropic' && (this.providerKeys.anthropic || process.env.ANTHROPIC_API_KEY) ? ['anthropic'] : []),
                ...(primaryProvider !== 'google' && (this.providerKeys.google || process.env.GOOGLE_API_KEY) ? ['google'] : []),
            ].filter((v, i, arr) => arr.indexOf(v) === i);

            for (const provider of providerSequence) {
                attemptedProviders.push(provider);
                try {
                    let files: GeneratedFile[] | undefined;
                    const providerModelId = this.resolveModelIdForProvider({
                      provider,
                      modelId: modelIdForProvider,
                      tier: selectedModel.tier,
                      strengths: selectedModel.strengths,
                      contextLimit: selectedModel.contextLimit,
                      maxTokens: selectedModel.maxTokens,
                    } as any);
                    if (provider === 'huggingface') {
                        files = await this.withTimeout(
                            generateComponentHuggingFace(providerModelId, contextPackage, refinement, session.discoveredPatterns, this.providerKeys),
                            PROVIDER_TIMEOUT_MS,
                            component.name
                        );
                    } else if (provider === 'openrouter') {
                        files = await this.withTimeout(
                            generateComponentOpenRouter(providerModelId, contextPackage, refinement, session.discoveredPatterns, this.providerKeys),
                            PROVIDER_TIMEOUT_MS,
                            component.name
                        );
                    } else if (provider === 'anthropic') {
                        files = await this.withTimeout(
                            generateComponent(contextPackage, refinement, session.discoveredPatterns, this.providerKeys),
                            PROVIDER_TIMEOUT_MS,
                            component.name
                        );
                    } else if (provider === 'google') {
                        files = await this.withTimeout(
                            generateComponentGemini(contextPackage, refinement, session.discoveredPatterns, this.providerKeys),
                            PROVIDER_TIMEOUT_MS,
                            component.name
                        );
                    }

                    if (files && files.length > 0) {
                        latestFiles = files;
                        if (provider !== primaryProvider) {
                            this.emitContextFlow({
                                id: crypto.randomUUID(),
                                timestamp: Date.now(),
                                source: provider,
                                target: 'ucol',
                                action: `↪ ${provider} fallback succeeded for ${component.name}`,
                                reasoning: `Primary provider ${primaryProvider} failed`,
                                status: 'complete',
                            });
                        }
                        break;
                    }
                } catch (err: any) {
                    const reason = err.message?.substring(0, 120) || 'Unknown error';
                    generationError = reason;
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
                    continue;
                }
            }

            if (!latestFiles || latestFiles.length === 0) {
                const sequence = attemptedProviders.join(' -> ');
                const errors = providerErrors.join('\n');
                throw new Error(
                    `Code generation failed for ${component.name}.\n` +
                    `Exhausted provider sequence: ${sequence}.\n` +
                    `Errors encountered:\n${errors}`
                );
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
                    this.emitContextFlow({
                        id: crypto.randomUUID(),
                        timestamp: Date.now(),
                        source: 'system',
                        target: 'user',
                        action: `⚡ Auto-approved ${component.name} (code unchanged)`,
                        reasoning: `Similarity ${(similarity * 100).toFixed(0)}% ≥ ${(SIMILARITY_THRESHOLD * 100).toFixed(0)}%`,
                        status: 'complete',
                    });
                    return latestFiles;
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
            const review = await reviewCode(latestFiles, component, plan, this.providerKeys);

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
                return latestFiles;
            }

            feedbackHistory.push(review);

            if (isPragmatismIssue && !activeConstraint) {
                activeConstraint = SIMPLICITY_CONSTRAINTS[
                    Math.floor(Math.random() * SIMPLICITY_CONSTRAINTS.length)
                ];
                session.constraintRounds++;

                this.emitContextFlow({
                    id: crypto.randomUUID(),
                    timestamp: Date.now(),
                    source: 'gemini',
                    target: selectedModel.provider,
                    action: `🎯 Simplicity constraint for ${component.name}`,
                    reasoning: `Over-engineered! ${activeConstraint}`,
                    status: 'active',
                });
            } else if (isOriginalityIssue && !activeConstraint) {
                activeConstraint = CREATIVITY_CONSTRAINTS[
                    Math.floor(Math.random() * CREATIVITY_CONSTRAINTS.length)
                ];
                session.constraintRounds++;

                this.emitContextFlow({
                    id: crypto.randomUUID(),
                    timestamp: Date.now(),
                    source: 'gemini',
                    target: selectedModel.provider,
                    action: `🎯 Creativity constraint for ${component.name}`,
                    reasoning: activeConstraint,
                    status: 'active',
                });
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
