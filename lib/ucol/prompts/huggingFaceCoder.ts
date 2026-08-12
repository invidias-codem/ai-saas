/**
 * Hugging Face Inference Providers — OpenAI-compatible chat completions.
 *
 * Uses https://router.huggingface.co/v1 with a single HF token.
 * Model IDs may include provider policies: :fastest, :cheapest, :preferred, or :<provider>.
 */

import type { ContextPackage, GeneratedFile, RefinementContext, DiscoveredPattern } from '@/lib/ucol/types';
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
    const items = Array.isArray(parsed) ? parsed : [parsed];
    return items.map((f: any) => ({
      path: f.path || f.filePath || `${componentName}.tsx`,
      content: f.content || f.code || '',
      language: f.language || 'tsx',
      component: componentName,
      model: 'huggingface',
    }));
  } catch {
    console.error('[UCOL:HFCoder] Failed to parse JSON:', text.substring(0, 300));
    return [
      {
        path: `components/${componentName}.tsx`,
        content: text,
        language: 'tsx',
        component: componentName,
        model: 'huggingface',
      },
    ];
  }
}

export async function generateComponentHuggingFace(
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

  const apiKey = providerKeys.huggingface || process.env.HUGGINGFACE_API_KEY;
  if (!apiKey) {
    throw new Error('HUGGINGFACE_API_KEY is not configured');
  }

  const response = await fetch('https://router.huggingface.co/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelId,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 8192,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    const reason = `HuggingFace API Error: ${response.status} - ${errorText}`;
    if (response.status === 401) {
      const masked = apiKey ? `${apiKey.slice(0, 6)}...${apiKey.slice(-4)}` : 'missing';
      console.error('[UCOL:HFCoder] 401 with key=', masked, 'model=', modelId, 'url=', 'https://router.huggingface.co/v1/chat/completions');
    }
    throw new Error(reason);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || '';
  return parseGeneratedFiles(text, component.name);
}
