import type { AgentMode } from '@/lib/llm/types';

export type OperatingProfileMode = 'copilot' | 'research' | 'agentic' | 'drafting' | 'memory_native' | 'custom';

export interface RuntimeProfileSignals {
  mode?: OperatingProfileMode | null;
  latency_preference?: 'fast' | 'balanced' | 'deep' | null;
  allow_agentic_runs?: boolean | null;
  tool_use_level?: 'none' | 'limited' | 'moderate' | 'high' | null;
  retrieval_depth?: 'minimal' | 'standard' | 'deep' | null;
  default_output_style?: 'chat' | 'report' | 'brief' | 'draft' | 'checklist' | null;
}

export function resolveAgentModeFromProfile(profile?: RuntimeProfileSignals | null): AgentMode {
  if (!profile) {
    return 'quality';
  }

  if (profile.mode === 'agentic' || profile.allow_agentic_runs === true) {
    return 'agentic';
  }

  if (profile.latency_preference === 'fast' && profile.mode === 'copilot') {
    return 'fast';
  }

  if (profile.latency_preference === 'deep' || profile.retrieval_depth === 'deep' || profile.mode === 'research') {
    return 'quality';
  }

  if (profile.mode === 'drafting' || profile.mode === 'memory_native' || profile.mode === 'custom') {
    return 'quality';
  }

  return 'quality';
}
