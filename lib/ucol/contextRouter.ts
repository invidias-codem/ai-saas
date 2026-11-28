// lib/ucol/contextRouter.ts
// Thin adapter over the canonical Code Builder engine (codeBuilderEngine.ts).
//
// Kept for backward compatibility: the API route and test script construct a
// ContextRouter and call planProject() then generateCode() (two phases, so the
// route can emit plan-ready and trim components in between). Internally each
// phase delegates to the single transport-independent engine.
//
// Extraction debt (call out, do not silently refactor here):
//   - installedDependencies are still read from process.cwd()/package.json
//     inside this adapter (fs + process.cwd() = ambient module state). The
//     engine takes them as an explicit input already; a durable worker must
//     pass them explicitly rather than relying on cwd.
//   - BuildSession is still mutated in place by the engine (reviewRounds,
//     discoveredPatterns, refinementLog). Fine while the session is created
//     per-request; a future worker must own/reconstruct it from durable state.

import * as fs from 'fs';
import * as path from 'path';

import { runCodeBuilder, planProject as enginePlanProject, generateCode as engineGenerateCode } from './codeBuilderEngine';
import type { CodeBuilderEngineInput } from './codeBuilderEngine';
import type {
    ProjectPlan,
    GeneratedFile,
    ContextFlowEntry,
    BuildSession,
    ComponentSpec,
} from './types';
import type { ProviderApiKeys } from '@/lib/userProviderKeys';

type ContextFlowCallback = (entry: ContextFlowEntry) => void;

interface ContextRouterOptions {
    onContextFlow: ContextFlowCallback;
    providerKeys?: ProviderApiKeys;
}

export class ContextRouter {
    private onContextFlow: ContextFlowCallback;
    private installedDependencies: string[];
    private providerKeys: ProviderApiKeys;

    constructor(options: ContextRouterOptions) {
        this.onContextFlow = options.onContextFlow;
        this.installedDependencies = this.getInstalledDependencies();
        this.providerKeys = options.providerKeys ?? {};
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

    private engineInput(prompt: string, mode: 'fast' | 'full', session: BuildSession): CodeBuilderEngineInput {
        return {
            buildId: session.id,
            requestId: session.id,
            userId: session.userId,
            prompt,
            mode,
            emit: this.onContextFlow,
            installedDependencies: this.installedDependencies,
            providerKeys: this.providerKeys,
            session,
        };
    }

    async planProject(prompt: string, session: BuildSession): Promise<ProjectPlan> {
        // Phase 1 of the two-phase SSE flow, delegated to the canonical engine.
        return enginePlanProject(this.engineInput(prompt, 'full', session));
    }

    async generateCode(plan: ProjectPlan, session: BuildSession, fast = false): Promise<GeneratedFile[]> {
        // Phase 2 of the two-phase SSE flow, delegated to the canonical engine.
        return engineGenerateCode(
            this.engineInput(session.userPrompt ?? '', fast ? 'fast' : 'full', session),
            plan
        );
    }

    resolveBuildOrder(components: ComponentSpec[]): ComponentSpec[] {
        // Preserve the public method for any lingering callers.
        // ponytail: duplicated from the engine's pure helper — kept only for
        // API compatibility; prefer the engine path. Remove once no caller uses it.
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
}

export { runCodeBuilder };