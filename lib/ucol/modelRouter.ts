/**
 * UCOL Model Router — code generation routing (NVIDIA NIM).
 *
 * After the provider consolidation, code generation is served by a single
 * model — Kimi K3 (moonshotai/kimi-k3) on NVIDIA NIM. The router now exists to:
 *   1. Emit stable routing decisions for observability/telemetry
 *   2. Retain the escalation/thrash bookkeeping contract so callers that
 *      import `recordThrash` / `decide` keep working unchanged
 *
 * Escalation now resolves to the same Kimi K3 target (no multi-provider
 * cascade). This removes the openrouter / huggingface / anthropic / google
 * sprawl while preserving the shape of RouterDecision.
 */

import type { ComponentSpec, ProjectPlan, BuildSession, ContextFlowEntry } from './types';

export type ModelTier = 'L1' | 'L2' | 'L3';

export interface ModelTarget {
  provider: 'nvidia-nim';
  modelId: string;
  tier: ModelTier;
  contextLimit: number; // tokens
  maxTokens: number;
  strengths: string[];
}

export interface ModelUsageTelemetry {
  componentName: string;
  modelId: string;
  tier: ModelTier;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  saturation: number; // 0..1
  thrashCount: number;
  preempted: boolean;
  success: boolean;
  latencyMs: number;
  error?: string;
}

export interface RouterDecision {
  componentName: string;
  primaryModel: ModelTarget;
  escalationModel: ModelTarget;
  reason: string;
  preemptive: boolean;
  telemetry: Record<string, any>;
}

const KIMI_K3: ModelTarget = {
  provider: 'nvidia-nim',
  modelId: 'moonshotai/kimi-k3',
  tier: 'L1',
  contextLimit: 256_000,
  maxTokens: 16384,
  strengths: ['react', 'typescript', 'ui-components', 'fullstack', 'agentic', 'tool-use', 'long-horizon'],
};

const MODEL_CATALOG: ModelTarget[] = [KIMI_K3];

const MAX_PROMPT_TOKENS_ESTIMATE = (text: string) => Math.ceil(text.length / 3.5);

function tierOf(_modelId: string): ModelTier {
  return 'L1';
}

export class ModelRouter {
  private telemetry: ModelUsageTelemetry[] = [];
  private componentThrash: Map<string, number> = new Map();

  constructor(private onContextFlow?: (entry: ContextFlowEntry) => void) {}

  decide(component: ComponentSpec, plan: ProjectPlan, session: BuildSession, promptText: string): RouterDecision {
    void session;
    const primary = KIMI_K3;
    const primaryTokens = MAX_PROMPT_TOKENS_ESTIMATE(promptText);
    const saturation = primaryTokens / primary.contextLimit;

    this.emit('UCOL:Router', `Routed ${component.name} to ${primary.modelId}`, {
      component: component.name,
      tier: primary.tier,
    });

    return {
      componentName: component.name,
      primaryModel: primary,
      escalationModel: primary,
      reason: `Kimi K3 (NVIDIA NIM) — strengths: ${primary.strengths.slice(0, 3).join(', ')}`,
      preemptive: false,
      telemetry: { promptTokens: primaryTokens, saturation },
    };
  }

  recordThrash(componentName: string) {
    const current = this.componentThrash.get(componentName) || 0;
    this.componentThrash.set(componentName, current + 1);
  }

  recordTelemetry(t: ModelUsageTelemetry) {
    this.telemetry.push(t);
  }

  getTelemetry() {
    return this.telemetry;
  }

  resetThrash(componentName: string) {
    this.componentThrash.set(componentName, 0);
  }

  private emit(source: string, action: string, meta?: Record<string, any>) {
    if (!this.onContextFlow) return;
    this.onContextFlow({
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      source,
      target: 'ucol',
      action,
      reasoning: meta ? JSON.stringify(meta) : '',
      status: 'active',
    });
  }
}

// Re-export for any lingering references.
export { tierOf, MODEL_CATALOG };