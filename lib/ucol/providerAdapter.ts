/**
 * UCOL Code Provider Abstraction
 *
 * Wraps existing LLM provider implementations so the model router
 * can dispatch code-generation requests without knowing backend details.
 */

import type { GeneratedFile, ContextPackage, RefinementContext, DiscoveredPattern } from '@/lib/ucol/types';
import type { ProviderApiKeys } from '@/lib/userProviderKeys';
import { OpenRouterProvider } from '@/lib/llm/providers/openrouter';
import { ClaudeProvider } from '@/lib/llm/providers/claude';
import { GeminiProvider } from '@/lib/llm/providers/gemini';
import { DeepSeekProvider } from '@/lib/llm/providers/deepseek';
import type { LLMProvider } from '@/lib/llm/types';

export interface ProviderCallContext {
  providerKeys: ProviderApiKeys;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface CodeProvider {
  id: string;
  label: string;
  tier: 'L1' | 'L2' | 'L3';
  modelId: string;
  generateCode(
    context: ContextPackage,
    refinement?: RefinementContext,
    discoveredPatterns?: DiscoveredPattern[],
    call?: ProviderCallContext,
  ): Promise<GeneratedFile[]>;
}

function resolveProvider(providerName: string, providerKeys: ProviderApiKeys): LLMProvider {
  switch (providerName) {
    case 'openrouter':
      return new OpenRouterProvider(providerKeys);
    case 'claude':
      return new ClaudeProvider(providerKeys);
    case 'google':
      return new GeminiProvider(providerKeys);
    case 'deepseek':
      return new DeepSeekProvider(providerKeys);
    default:
      return new OpenRouterProvider(providerKeys);
  }
}

export function buildCodeProvider(modelId: string, providerKeys: ProviderApiKeys): CodeProvider {
  const provider = new OpenRouterProvider(providerKeys);
  const providerName = modelId.split('/')[0] || 'openrouter';
  const base = resolveProvider(providerName, providerKeys);

  return {
    id: providerName,
    label: modelId,
    tier: 'L1',
    modelId,
    async generateCode(context, refinement, discoveredPatterns, call) {
      const { component, fullPlan, existingFiles, techStack } = context.payload.content;

      const systemPrompt = refinement && refinement.feedbackHistory.length > 0
        ? UCOL_CODER_SYSTEM_PROMPT + REFINEMENT_ADDENDUM
        : UCOL_CODER_SYSTEM_PROMPT;

      const userPrompt = buildCodeUserPrompt({
        component,
        fullPlan,
        existingFiles,
        techStack,
        refinement,
        discoveredPatterns,
      });

      const result = await base.generateStream(
        [{ role: 'user', text: userPrompt }],
        systemPrompt,
        {
          model: modelId,
          maxTokens: 8192,
          temperature: 0.7,
          signal: call?.signal,
        },
      );

      const text = await readStreamText(result.stream);
      return parseGeneratedFiles(text, component.name);
    },
  };
}

const UCOL_CODER_SYSTEM_PROMPT = `You are an expert React/Next.js developer. You receive a component specification from a planning agent and generate production-quality code.

You will receive:
- The component spec (name, props, description, file path)
- The full project plan (for context on the overall app)
- Already-generated dependency files (so you can import correctly)
- The tech stack

CRITICAL — GO BEYOND THE SPEC (BUT BE PRAGMATIC):
- Handle edge cases the spec DIDN'T mention (empty states, loading, errors, overflow).
- Extract reusable logic into custom hooks when it makes the code cleaner.
- Use defensive coding: type guards, null checks, fallback values.
- Choose non-obvious patterns ONLY when they genuinely improve the code.

WARNING — AVOID OVER-ENGINEERING (PRAGMATISM AXIS):
- Do NOT build massive enterprise architectures for simple UI components.
- Do NOT use \`useReducer\` for simple toggles.
- Do NOT build exponential backoff retry hooks for a basic submit button unless strictly necessary.

OUTPUT FORMAT:
Return a JSON array of file objects. Each object has:
- "path": string (e.g., "components/TodoList.tsx")
- "content": string (the full file source code)
- "language": string (e.g., "tsx", "ts")

Output a single JSON array (NOT wrapped in another array). No markdown fences, no explanation text.`;

const REFINEMENT_ADDENDUM = `

## ⚠️ REVISION REQUIRED

A Lead QA Engineer reviewed your previous code and found issues. Fix every flagged issue immediately. The reviewer's feedback is below. Fix the problems, output the corrected JSON array, and nothing else.`;

function buildCodeUserPrompt(input: {
  component: any;
  fullPlan: any;
  existingFiles?: any[];
  techStack: string[];
  refinement?: RefinementContext;
  discoveredPatterns?: DiscoveredPattern[];
}): string {
  const { component, fullPlan, existingFiles, techStack, refinement, discoveredPatterns } = input;

  let prompt = `## Project Plan\n${JSON.stringify(fullPlan, null, 2)}\n\n## Component to Build\n${JSON.stringify(component, null, 2)}\n\n## Already Built Dependencies\n${(existingFiles || []).map((f: any) => `### ${f.path}\n\`\`\`${f.language}\n${f.content}\n\`\`\``).join('\n\n') || '(none — this is a leaf component)'}\n\n## Tech Stack\n${techStack.join(', ')}`;

  if (discoveredPatterns && discoveredPatterns.length > 0) {
    prompt += `\n\n## 💡 Novel Patterns Discovered by Your Team\n${discoveredPatterns.map((p, i) => `${i + 1}. **${p.component}** — ${p.pattern} (originality: ${p.originalityScore}/10)`).join('\n')}`;
  }

  if (refinement && refinement.feedbackHistory.length > 0) {
    prompt += `\n\n---\n## REVISION ATTEMPT ${refinement.attempt}\n`;
    prompt += `\n### Your Previous Code\n\`\`\`\n${refinement.previousCode}\n\`\`\`\n`;
    if (refinement.constraint) {
      prompt += `\n### 🎯 CREATIVITY CONSTRAINT\n**${refinement.constraint}**\n`;
    }
    prompt += `\n### Review Feedback History (ALL rounds)\n`;
    for (let i = 0; i < refinement.feedbackHistory.length; i++) {
      const fb = refinement.feedbackHistory[i];
      prompt += `\n**Round ${i + 1}** (Correctness: ${fb.score}/10, Originality: ${fb.originalityScore}/10, Pragmatism: ${fb.pragmatismScore}/10, ${fb.approved ? 'Approved' : 'Rejected'})\n`;
      prompt += `- Critique: ${fb.critique}\n`;
      if (fb.suggestions.length > 0) {
        prompt += `- Fix instructions:\n${fb.suggestions.map(s => `  - ${s}`).join('\n')}\n`;
      }
    }
    prompt += `\nFix ALL flagged issues. Output the corrected JSON array.`;
  } else {
    prompt += `\n\nGenerate the code files for "${component.name}". Output ONLY a JSON array.`;
  }

  return prompt;
}

async function readStreamText(stream: ReadableStream<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder('utf-8');
  const reader = stream.getReader();
  let text = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  return text;
}

function parseGeneratedFiles(text: string, componentName: string): GeneratedFile[] {
  let jsonStr = text.trim();
  const fenceMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) jsonStr = fenceMatch[1].trim();

  try {
    let parsed = JSON.parse(jsonStr);
    if (Array.isArray(parsed) && parsed.length === 1 && Array.isArray(parsed[0])) {
      parsed = parsed[0];
    }
    const items = Array.isArray(parsed) ? parsed : [parsed];
    return items.map((f: any) => ({
      path: f.path || f.filePath || `${componentName}.tsx`,
      content: f.content || f.code || '',
      language: f.language || 'tsx',
      component: componentName,
      model: 'openrouter',
    }));
  } catch {
    console.error('[UCOL:CodeProvider] Failed to parse JSON:', text.substring(0, 300));
    return [
      {
        path: `components/${componentName}.tsx`,
        content: text,
        language: 'tsx',
        component: componentName,
        model: 'openrouter',
      },
    ];
  }
}
