/**
 * OpenRouter-backed code generation for UCOL.
 *
 * Uses the OpenRouter chat completions API with JSON response format
 * for open-weight models (Qwen, Kimi, DeepSeek, GLM, etc.).
 */

import type { ContextPackage, GeneratedFile, RefinementContext, DiscoveredPattern } from '../types';
import type { ProviderApiKeys } from '@/lib/userProviderKeys';

const CODER_SYSTEM_PROMPT = `You are an expert React/Next.js developer. You receive a component specification from a planning agent and generate production-quality code.

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
- Name things to reveal intent, not just function ("handleProductCreation" not "handleSubmit").

RECITATION AVOIDANCE:
- Write a novel, custom implementation tailored to THIS specific application. Do not output verbatim standard boilerplate.
- Ensure all variable names, comments, and structural layouts are uniquely adapted to this project's context.
- Break exact string matches to training-data templates by incorporating domain-specific logic and naming.

WARNING — AVOID OVER-ENGINEERING (PRAGMATISM AXIS):
- Do NOT build massive enterprise architectures for simple UI components.
- Do NOT use \`useReducer\` for simple toggles.
- Do NOT build exponential backoff retry hooks for a basic submit button unless strictly necessary.
- Your code is evaluated on Correctness (1-10), Originality (1-10), AND Pragmatism (1-10). If you over-engineer and bloat the code, you will be rejected on the Pragmatism axis. Keep it elegant, readable, and appropriately scoped.

OUTPUT FORMAT:
Return a JSON array of file objects. Each object has:
- "path": string (e.g., "components/TodoList.tsx")  
- "content": string (the full file source code)
- "language": string (e.g., "tsx", "ts")

Output a single JSON array (NOT wrapped in another array). No markdown fences, no explanation text.`;

const REFINEMENT_ADDENDUM = `

## ⚠️ REVISION REQUIRED

A Lead QA Engineer reviewed your previous code and found issues. Fix every flagged issue immediately. The reviewer's feedback is below. Fix the problems, output the corrected JSON array, and nothing else.`;

function buildUserPrompt(input: {
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

function parseGeneratedFiles(text: string, componentName: string): GeneratedFile[] {
  let jsonStr = text.trim();
  const fenceMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) jsonStr = fenceMatch[1].trim();

  try {
    let parsed = JSON.parse(jsonStr);
    if (Array.isArray(parsed) && parsed.length === 1 && Array.isArray(parsed[0])) {
      parsed = parsed[0];
    }
    // Some models wrap the array when response_format json_object is honored:
    // {"files": [...]} / {"result": [...]} — unwrap the first array value found.
    if (!Array.isArray(parsed) && parsed && typeof parsed === 'object') {
      const arrValue = Object.values(parsed).find(v => Array.isArray(v));
      if (arrValue) parsed = arrValue;
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
    console.error('[UCOL:OpenRouterCoder] Failed to parse JSON:', text.substring(0, 300));
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

export async function generateComponentOpenRouter(
  modelId: string,
  contextPackage: ContextPackage,
  refinement?: RefinementContext,
  discoveredPatterns?: DiscoveredPattern[],
  providerKeys: ProviderApiKeys = {}
): Promise<GeneratedFile[]> {
  const { component, fullPlan, existingFiles, techStack } = contextPackage.payload.content;

  const systemPrompt = refinement && refinement.feedbackHistory.length > 0
    ? CODER_SYSTEM_PROMPT + REFINEMENT_ADDENDUM
    : CODER_SYSTEM_PROMPT;

  const userPrompt = buildUserPrompt({
    component,
    fullPlan,
    existingFiles,
    techStack,
    refinement,
    discoveredPatterns,
  });

  const apiKey = providerKeys.openrouter || process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not configured');
  }

  const callOpenRouter = async (model: string, useJsonFormat: boolean) => {
    return fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://lattice-os.local',
        'X-Title': 'Lattice OS',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        // json_object is not honored by every open-model provider on OpenRouter;
        // when unsupported we retry without it and rely on tolerant parsing.
        ...(useJsonFormat ? { response_format: { type: 'json_object' } } : {}),
        temperature: 0.7,
        max_tokens: 8192,
      }),
    });
  };

  let response = await callOpenRouter(modelId, true);

  // Retry once without response_format if the provider rejects it (400/404 on format)
  if (!response.ok && (response.status === 400 || response.status === 404)) {
    const firstError = await response.text().catch(() => '');
    if (/response_format|json_object|not supported/i.test(firstError) || response.status === 400) {
      response = await callOpenRouter(modelId, false);
    } else if (response.status === 404) {
      // Model slug not found — fall back to the default coder slug
      response = await callOpenRouter('qwen/qwen3-coder', true);
    }
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    if (response.status === 402) {
      throw new Error('OpenRouter: insufficient credits (402). Top up at openrouter.ai/credits');
    }
    if (response.status === 429) {
      throw new Error('OpenRouter: rate limited (429). Retry shortly or add credits to raise limits.');
    }
    throw new Error(`OpenRouter API Error: ${response.status} - ${errorText.substring(0, 300)}`);
  }

  const data = await response.json();
  // OpenRouter surfaces upstream provider failures as 200 + error payload
  if (data.error) {
    throw new Error(`OpenRouter upstream error: ${data.error.message || JSON.stringify(data.error).substring(0, 200)}`);
  }
  const text = data.choices?.[0]?.message?.content || '';
  if (!text.trim()) {
    throw new Error(`OpenRouter returned empty content for ${modelId} (finish_reason: ${data.choices?.[0]?.finish_reason || 'unknown'})`);
  }
  return parseGeneratedFiles(text, component.name);
}
