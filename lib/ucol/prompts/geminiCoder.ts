// lib/ucol/prompts/geminiCoder.ts
// Gemini code-generation provider — fallback for the UCOL Code Builder debate loop
// when the primary NIM path (kimiCoderProvider) throws DEGRADED, timeout, or stream-drop.
//
// Uses the same prompt contract as kimiCoderProvider: ContextPackage in → GeneratedFile[] out.
import { GeminiProvider } from '@/lib/llm/providers/gemini';
import type { StreamResult } from '@/lib/llm/types';
import type { ContextPackage, GeneratedFile, RefinementContext, DiscoveredPattern } from '../types';

async function streamToText(result: StreamResult): Promise<string> {
  const reader = result.stream.getReader();
  const decoder = new TextDecoder();
  let text = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  return text;
}

const GEMINI_CODER_SYSTEM_PROMPT = `You are an expert React/Next.js developer who writes production-ready code.

Output a JSON array of file objects:
{ "path": string, "content": string, "language": string }

Rules: TypeScript, Tailwind CSS, defensive coding, no markdown fences.`;

export const geminiCoderProvider = {
  id: 'gemini',
  label: 'Gemini (Cloud Fallback)',
  tier: 'L2' as const,

  async generateCode(
    contextPackage: ContextPackage,
    refinement?: RefinementContext,
    discoveredPatterns?: DiscoveredPattern[],
  ): Promise<GeneratedFile[]> {
    const provider = new GeminiProvider();
    const { component, fullPlan, existingFiles, techStack } = contextPackage.payload.content;

    const lines = [
      `## Project Context`,
      `App: ${fullPlan.appName} — ${fullPlan.description}`,
      `Tech stack: ${(techStack || []).join(', ')}`,
      `Components: ${(fullPlan.components || []).map((c: any) => c.name).join(', ')}`,
      '',
      `## Component to Build`,
      `Name: ${component.name}`,
      `File: ${component.filePath}`,
      `Description: ${component.description}`,
      `Props: ${JSON.stringify(component.props)}`,
      `Dependencies: ${(component.dependencies || []).join(', ') || 'none'}`,
    ];

    if ((existingFiles || []).length > 0) {
      lines.push('', '## Already Built Dependencies');
      for (const f of existingFiles) {
        const preview = f.content.length > 1200 ? f.content.substring(0, 1200) + '\n// ...' : f.content;
        lines.push(`### ${f.path}\n\`\`\`${f.language}\n${preview}\n\`\`\``);
      }
    }

    if (discoveredPatterns && discoveredPatterns.length > 0) {
      lines.push('', '## Novel Patterns from Earlier Components');
      for (const p of discoveredPatterns) {
        lines.push(`- ${p.component}: ${p.pattern} (originality ${p.originalityScore}/10)`);
      }
    }

    if (refinement && refinement.feedbackHistory.length > 0) {
      lines.push(
        '',
        `## Revision Attempt ${refinement.attempt}`,
        'Fix ALL issues from previous review. Output corrected JSON only.'
      );
    }

    const result = await provider.generateStream(
      [{ role: 'user', text: lines.join('\n') }],
      GEMINI_CODER_SYSTEM_PROMPT,
      { model: 'gemini-2.5-flash', maxTokens: 8192, temperature: 0.7 }
    );

    const text = await streamToText(result);
    return parseGeneratedFiles(text, component.name);
  },
};

function parseGeneratedFiles(text: string, componentName: string): GeneratedFile[] {
  let jsonStr = text.trim();
  const fenceMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) jsonStr = fenceMatch[1].trim();

  try {
    const parsed = JSON.parse(jsonStr);
    return (Array.isArray(parsed) ? parsed : [parsed]).map((f: any) => ({
      path: f.path || f.filePath || `components/${componentName}.tsx`,
      content: f.content || f.code || '',
      language: f.language || 'tsx',
      component: componentName,
      model: 'gemini',
    }));
  } catch {
    return [
      {
        path: `components/${componentName}.tsx`,
        content: text,
        language: 'tsx',
        component: componentName,
        model: 'gemini',
      },
    ];
  }
}
