/**
 * UCOL Model Router — dynamic escalation cascade for code generation.
 *
 * Tiering:
 *  - L1 small/fast: Qwen3-Coder, gpt-oss-120b
 *  - L2 agentic:    Kimi K3 / K2.6
 *  - L3 heavy:      DeepSeek-V4-Pro / R1, GLM-5.2
 *
 * Triggers:
 *  1. Token pressure: prompt_tokens / context_limit >= 0.8
 *  2. Execution thrash: repeated syntax/compile/promotion denylist failures
 *  3. Semantic complexity: cross-file deps, state machine, multi-page scaffold
 */

import type { ComponentSpec, ProjectPlan, BuildSession, ContextFlowEntry } from './types';

export type ModelTier = 'L1' | 'L2' | 'L3';

export interface ModelTarget {
  provider: 'openrouter' | 'huggingface' | 'together' | 'replicate' | 'openai' | 'anthropic' | 'google' | 'nous';
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
  preempted: boolean; // true if escalated before first attempt
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

const MODEL_CATALOG: ModelTarget[] = [
  {
    provider: 'openrouter',
    modelId: 'qwen/qwen3-coder-480b-a35b',
    tier: 'L1',
    contextLimit: 256_000,
    maxTokens: 8192,
    strengths: ['react', 'typescript', 'ui-components', 'fullstack', 'repo-scale'],
  },
  {
    provider: 'openrouter',
    modelId: 'nousresearch/gpt-oss-120b',
    tier: 'L1',
    contextLimit: 128_000,
    maxTokens: 8192,
    strengths: ['algorithmic', 'fast-reasoning', 'async-logic'],
  },
  {
    provider: 'openrouter',
    modelId: 'moonshotai/kimi-k2.6',
    tier: 'L2',
    contextLimit: 128_000,
    maxTokens: 16384,
    strengths: ['agentic', 'multi-step', 'tool-use', 'iterative'],
  },
  {
    provider: 'openrouter',
    modelId: 'moonshotai/kimi-k3',
    tier: 'L2',
    contextLimit: 128_000,
    maxTokens: 16384,
    strengths: ['agentic', 'long-horizon', 'tool-use'],
  },
  {
    provider: 'openrouter',
    modelId: 'deepseek/deepseek-v4-pro',
    tier: 'L3',
    contextLimit: 128_000,
    maxTokens: 32768,
    strengths: ['reasoning', 'systems', 'complex-algorithm', 'rust', 'low-level'],
  },
  {
    provider: 'openrouter',
    modelId: 'deepseek/deepseek-r1',
    tier: 'L3',
    contextLimit: 64_000,
    maxTokens: 32768,
    strengths: ['reasoning', 'step-by-step', 'math', 'codeforces'],
  },
  {
    provider: 'openrouter',
    modelId: 'z-ai/glm-5.2',
    tier: 'L3',
    contextLimit: 1_000_000,
    maxTokens: 8192,
    strengths: ['massive-context', 'repo-scaffold', 'sandbox-architecture', 'logs'],
  },
];

const TOKEN_SATURATION_THRESHOLD = 0.8;
const THRASH_THRESHOLD = 2; // failures before escalation within one component loop
const MAX_PROMPT_TOKENS_ESTIMATE = (text: string) => Math.ceil(text.length / 3.5); // rough chars→tokens

// Periodic / modular / cyclic signatures that imply deeper geometric representations.
// Routing these to a heavy reasoning model avoids thrashing on edge cases.
const CYCLIC_SIGNATURES = [
  /\bmodulo\b/i,
  /\bmod\b/i,
  /\bcron\b/i,
  /\bschedul(e|er|ing)\b/i,
  /\bcircular\b/i,
  /\bsinusoidal\b/i,
  /\bsin\b/i,
  /\bcos\b/i,
  /\btan\b/i,
  /\bperiodic\b/i,
  /\bcycle\b/i,
  /\boscillat/i,
  /\bwave\b/i,
  /\bfourier\b/i,
  /\bphase\b/i,
  /\bfinite state machine\b/i,
  /\bfsm\b/i,
  /\bstate machine\b/i,
];

function matchModels(component: ComponentSpec, plan: ProjectPlan): ModelTarget[] {
  const blob = `${component.name} ${component.description} ${component.filePath} ${plan.description} ${plan.techStack.join(' ')} ${component.dependencies.join(' ')}`.toLowerCase();

  const scored = MODEL_CATALOG.map(m => {
    let score = 0;
    for (const s of m.strengths) {
      if (blob.includes(s)) score++;
    }
    // Semantic complexity boosters
    if (component.dependencies.length >= 3) score += 1;
    if ((plan.components?.length || 0) >= 8) score += 1;
    if (/\b(state machine|reducer|router|layout|scaffold|provider|context)\b/.test(blob)) score += 1;
    return { model: m, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const matched = scored.filter(s => s.score > 0).map(s => s.model);
  if (matched.length === 0) {
    // Default L1 fallback
    return [MODEL_CATALOG.find(m => m.tier === 'L1')!];
  }
  return matched;
}

function tierOf(modelId: string): ModelTier {
  const m = MODEL_CATALOG.find(x => x.modelId === modelId);
  return m?.tier ?? 'L1';
}

function escalate(current: ModelTarget): ModelTarget | null {
  if (current.tier === 'L3') return null;
  const nextTier = current.tier === 'L1' ? 'L2' : 'L3';
  const candidates = MODEL_CATALOG.filter(m => m.tier === nextTier);
  return candidates[Math.floor(Math.random() * candidates.length)] || null;
}

export class ModelRouter {
  private telemetry: ModelUsageTelemetry[] = [];
  private componentThrash: Map<string, number> = new Map();

  constructor(private onContextFlow?: (entry: ContextFlowEntry) => void) {}

  decide(component: ComponentSpec, plan: ProjectPlan, session: BuildSession, promptText: string): RouterDecision {
    const candidates = matchModels(component, plan);
    const primary = candidates[0];
    const primaryTokens = MAX_PROMPT_TOKENS_ESTIMATE(promptText);
    const saturation = primaryTokens / primary.contextLimit;

    const saturationEscalation = saturation >= TOKEN_SATURATION_THRESHOLD;
    const thrashCount = this.componentThrash.get(component.name) || 0;
    const thrashEscalation = thrashCount >= THRASH_THRESHOLD;

    const semanticEscalation = candidates.length >= 2 && primary.tier !== 'L1' === false
      ? candidates[0].tier !== candidates[1].tier && candidates[1].tier === 'L3'
      : false;

    // Preemptive bypass if task is clearly heavy
    const isHeavyTask =
      component.dependencies.length >= 4 ||
      /(scaffold|provider|context|router|layout|state machine)/i.test(`${component.name} ${component.description}`);

    if (isHeavyTask && primary.tier !== 'L3') {
      const heavy = MODEL_CATALOG.find(m => m.tier === 'L3')!;
      this.emit('UCOL:Router', 'Preemptively routed to L3 heavy model', {
        component: component.name,
        reason: 'semantic-complexity',
      });
      return {
        componentName: component.name,
        primaryModel: heavy,
        escalationModel: heavy,
        reason: `Semantic complexity trigger: deps=${component.dependencies.length}, heavy keywords matched`,
        preemptive: true,
        telemetry: { promptTokens: primaryTokens },
      };
    }

    if (thrashEscalation) {
      const esc = escalate(primary) || primary;
      this.emit('UCOL:Router', `Escalated ${component.name} due to thrash (${thrashCount})`, {
        component: component.name,
        thrashCount,
      });
      return {
        componentName: component.name,
        primaryModel: esc,
        escalationModel: esc,
        reason: `Thrash trigger: ${thrashCount} failures in ${component.name}`,
        preemptive: true,
        telemetry: { promptTokens: primaryTokens },
      };
    }

    // ── New: periodic/modular/cyclic semantic preemption ──
    const cyclicBlob = `${component.name} ${component.description} ${component.filePath} ${plan.description} ${plan.techStack.join(' ')} ${component.dependencies.join(' ')} ${promptText}`;
    const cyclicMatch = CYCLIC_SIGNATURES.find(re => re.test(cyclicBlob));
    if (cyclicMatch) {
      const heavy = MODEL_CATALOG.find(m => m.tier === 'L3' && m.strengths.includes('reasoning')) || MODEL_CATALOG.find(m => m.tier === 'L3')!;
      this.emit('UCOL:Router', `Cyclic signature detected in ${component.name}, preemptively routed to ${heavy.modelId}`, {
        component: component.name,
        trigger: cyclicMatch.source,
      });
      return {
        componentName: component.name,
        primaryModel: heavy,
        escalationModel: heavy,
        reason: `Math mismatch trigger: cyclic/modular signature matched (${cyclicMatch.source})`,
        preemptive: true,
        telemetry: { promptTokens: primaryTokens, cyclicTrigger: cyclicMatch.source },
      };
    }

    if (saturationEscalation) {
      const esc = escalate(primary) || primary;
      this.emit('UCOL:Router', `Escalated ${component.name} due to token saturation ${(saturation * 100).toFixed(0)}%`, {
        component: component.name,
        saturation,
      });
      return {
        componentName: component.name,
        primaryModel: esc,
        escalationModel: esc,
        reason: `Token pressure trigger: ${(saturation * 100).toFixed(0)}% saturation`,
        preemptive: true,
        telemetry: { promptTokens: primaryTokens },
      };
    }

    // Standard: start at primary, keep an escalation target
    const escalationTarget = escalate(primary) || primary;
    this.emit('UCOL:Router', `Routed ${component.name} to ${primary.modelId}`, {
      component: component.name,
      tier: primary.tier,
    });
    return {
      componentName: component.name,
      primaryModel: primary,
      escalationModel: escalationTarget,
      reason: `Matched strengths: ${primary.strengths.slice(0, 3).join(', ')}`,
      preemptive: false,
      telemetry: { promptTokens: primaryTokens },
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
