// lib/ucol/prompts/geminiCoder.ts
// Gemini-based code generation — fallback when Claude is unavailable (billing, rate limit, etc.)
// Uses the same ContextPackage/RefinementContext interfaces as claudeCoder.ts.

import { GoogleGenerativeAI } from '@google/generative-ai';
import { requireEnv } from '@/lib/env';
import type { ContextPackage, GeneratedFile, RefinementContext, DiscoveredPattern } from '../types';

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

export async function generateComponentGemini(
    contextPackage: ContextPackage,
    refinement?: RefinementContext,
    discoveredPatterns?: DiscoveredPattern[]
): Promise<GeneratedFile[]> {
    const { component, fullPlan, existingFiles, techStack } = contextPackage.payload.content;

    const genAI = new GoogleGenerativeAI(requireEnv('GOOGLE_API_KEY'));

    const systemPrompt = refinement && refinement.feedbackHistory.length > 0
        ? CODER_SYSTEM_PROMPT + REFINEMENT_ADDENDUM
        : CODER_SYSTEM_PROMPT;

    const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash',
        systemInstruction: { role: 'user', parts: [{ text: systemPrompt }] },
    });

    let userPrompt = `## Project Plan
${JSON.stringify(fullPlan, null, 2)}

## Component to Build
${JSON.stringify(component, null, 2)}

## Already Built Dependencies
${(existingFiles || []).map((f: GeneratedFile) => `### ${f.path}\n\`\`\`${f.language}\n${f.content}\n\`\`\``).join('\n\n') || '(none — this is a leaf component)'}

## Tech Stack
${(techStack || []).join(', ')}`;

    // Inject discovered patterns from earlier components
    if (discoveredPatterns && discoveredPatterns.length > 0) {
        userPrompt += `\n\n## 💡 Novel Patterns Discovered by Your Team\n${discoveredPatterns.map((p, i) => `${i + 1}. **${p.component}** — ${p.pattern} (originality: ${p.originalityScore}/10)`).join('\n')}`;
    }

    // Append feedback chain for revisions
    if (refinement && refinement.feedbackHistory.length > 0) {
        userPrompt += `\n\n---\n## REVISION ATTEMPT ${refinement.attempt}\n`;
        userPrompt += `\n### Your Previous Code\n\`\`\`\n${refinement.previousCode}\n\`\`\`\n`;
        if (refinement.constraint) {
            userPrompt += `\n### 🎯 CREATIVITY CONSTRAINT\n**${refinement.constraint}**\n`;
        }
        userPrompt += `\n### Review Feedback History (ALL rounds)\n`;
        for (let i = 0; i < refinement.feedbackHistory.length; i++) {
            const fb = refinement.feedbackHistory[i];
            userPrompt += `\n**Round ${i + 1}** (Correctness: ${fb.score}/10, Originality: ${fb.originalityScore}/10, Pragmatism: ${fb.pragmatismScore}/10, ${fb.approved ? 'Approved' : 'Rejected'})\n`;
            userPrompt += `- Critique: ${fb.critique}\n`;
            if (fb.suggestions.length > 0) {
                userPrompt += `- Fix instructions:\n${fb.suggestions.map(s => `  - ${s}`).join('\n')}\n`;
            }
        }
        userPrompt += `\nFix ALL flagged issues. Output the corrected JSON array.`;
    } else {
        userPrompt += `\n\nGenerate the code files for "${component.name}". Output ONLY a JSON array.`;
    }

    const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.7,
            maxOutputTokens: 8192,
        },
    });

    if (!result.response) {
        throw new Error('[UCOL:GeminiCoder] No response received');
    }

    const text = result.response.text();
    return parseGeneratedFiles(text, component.name);
}

function parseGeneratedFiles(text: string, componentName: string): GeneratedFile[] {
    let jsonStr = text.trim();

    // Strip markdown fences if present
    const fenceMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (fenceMatch) jsonStr = fenceMatch[1].trim();

    try {
        let parsed = JSON.parse(jsonStr);
        // Unwrap nested array
        if (Array.isArray(parsed) && parsed.length === 1 && Array.isArray(parsed[0])) {
            parsed = parsed[0];
        }
        const items = Array.isArray(parsed) ? parsed : [parsed];
        return items.map((f: any) => ({
            path: f.path || f.filePath || `${componentName}.tsx`,
            content: f.content || f.code || '',
            language: f.language || 'tsx',
            component: componentName,
            model: 'gemini',
        }));
    } catch {
        console.error('[UCOL:GeminiCoder] Failed to parse JSON:', text.substring(0, 300));
        return [{
            path: `components/${componentName}.tsx`,
            content: text,
            language: 'tsx',
            component: componentName,
            model: 'gemini',
        }];
    }
}
