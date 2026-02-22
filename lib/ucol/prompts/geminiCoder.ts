// lib/ucol/prompts/geminiCoder.ts
// Gemini-based code generation — fallback when Claude is unavailable (billing, rate limit, etc.)
// Uses the same ContextPackage/RefinementContext interfaces as claudeCoder.ts.

import { GoogleGenerativeAI } from '@google/generative-ai';
import { requireEnv } from '@/lib/env';
import type { ContextPackage, GeneratedFile, RefinementContext } from '../types';

const CODER_SYSTEM_PROMPT = `You are an expert React/Next.js developer. You receive a component specification from a planning agent and generate production-quality code.

You will receive:
- The component spec (name, props, description, file path)
- The full project plan (for context on the overall app)
- Already-generated dependency files (so you can import correctly)
- The tech stack

RULES:
- Generate ONLY the code for the requested component.
- Use TypeScript with proper type annotations.
- Use Tailwind CSS for styling (utility-first).
- Import dependencies using relative paths based on the file structure.
- Include proper React imports ("use client" directive where needed).
- Write clean, readable, production-quality code.
- If the component is a page, export it as default.
- If the component is a reusable UI element, use named exports.

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
    refinement?: RefinementContext
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

    // Append feedback chain for revisions
    if (refinement && refinement.feedbackHistory.length > 0) {
        userPrompt += `\n\n---\n## REVISION ATTEMPT ${refinement.attempt}\n`;
        userPrompt += `\n### Your Previous Code\n\`\`\`\n${refinement.previousCode}\n\`\`\`\n`;
        userPrompt += `\n### Review Feedback History (ALL rounds)\n`;
        for (let i = 0; i < refinement.feedbackHistory.length; i++) {
            const fb = refinement.feedbackHistory[i];
            userPrompt += `\n**Round ${i + 1}** (Score: ${fb.score}/10, ${fb.approved ? 'Approved' : 'Rejected'})\n`;
            userPrompt += `- Critique: ${fb.critique}\n`;
            if (fb.suggestions.length > 0) {
                userPrompt += `- Fix instructions:\n${fb.suggestions.map(s => `  - ${s}`).join('\n')}\n`;
            }
            if (fb.failedCriteria.length > 0) {
                userPrompt += `- Failed criteria: ${fb.failedCriteria.join(', ')}\n`;
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
