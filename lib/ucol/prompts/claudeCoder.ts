// lib/ucol/prompts/claudeCoder.ts
// Claude code generation — generates component files from a plan + context.
// Supports iterative refinement with full feedback history from Gemini reviewer.

import Anthropic from '@anthropic-ai/sdk';
import type { ContextPackage, GeneratedFile, RefinementContext, ReviewFeedback } from '../types';

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

Output ONLY valid JSON. No markdown fences, no explanation text.`;

const REFINEMENT_ADDENDUM = `

## ⚠️ REVISION REQUIRED

You are pair programming with a Lead QA Engineer who reviewed your previous code and found issues. You must fix every flagged issue immediately without arguing or over-explaining. The reviewer's feedback is below. Fix the problems, output the corrected JSON, and nothing else.`;

function getAnthropicClient(): Anthropic {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    }
    return new Anthropic({ apiKey });
}

export async function generateComponent(
    contextPackage: ContextPackage,
    refinement?: RefinementContext
): Promise<GeneratedFile[]> {
    const { component, fullPlan, existingFiles, techStack } = contextPackage.payload.content;

    const anthropic = getAnthropicClient();

    let userPrompt = `## Project Plan
${JSON.stringify(fullPlan, null, 2)}

## Component to Build
${JSON.stringify(component, null, 2)}

## Already Built Dependencies
${(existingFiles || []).map((f: GeneratedFile) => `### ${f.path}\n\`\`\`${f.language}\n${f.content}\n\`\`\``).join('\n\n') || '(none — this is a leaf component)'}

## Tech Stack
${(techStack || []).join(', ')}`;

    // If this is a refinement, append the full feedback chain
    if (refinement && refinement.feedbackHistory.length > 0) {
        userPrompt += `\n\n---\n## REVISION ATTEMPT ${refinement.attempt}\n`;
        userPrompt += `\n### Your Previous Code\n\`\`\`\n${refinement.previousCode}\n\`\`\`\n`;

        // Include the FULL feedback history — not just the latest
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
        userPrompt += `\n\nGenerate the code files for "${component.name}". Remember: output ONLY a JSON array.`;
    }

    const systemPrompt = refinement && refinement.feedbackHistory.length > 0
        ? CODER_SYSTEM_PROMPT + REFINEMENT_ADDENDUM
        : CODER_SYSTEM_PROMPT;

    const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [
            {
                role: 'user',
                content: userPrompt,
            },
        ],
    });

    // Extract JSON from response
    const responseText = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map(block => block.text)
        .join('');

    const files = parseGeneratedFiles(responseText, component.name);
    return files;
}

/**
 * Parse Claude's response into GeneratedFile[].
 * Handles both clean JSON and JSON wrapped in markdown fences.
 */
function parseGeneratedFiles(text: string, componentName: string): GeneratedFile[] {
    // Try direct JSON parse first
    let jsonStr = text.trim();

    // Strip markdown code fences if present
    const fenceMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (fenceMatch) {
        jsonStr = fenceMatch[1].trim();
    }

    try {
        const parsed = JSON.parse(jsonStr);
        const files: GeneratedFile[] = (Array.isArray(parsed) ? parsed : [parsed]).map(f => ({
            path: f.path || f.filePath || `${componentName}.tsx`,
            content: f.content || f.code || '',
            language: f.language || 'tsx',
            component: componentName,
            model: 'claude',
        }));
        return files;
    } catch (parseError: any) {
        console.error('[UCOL:Claude] Failed to parse code JSON:', text.substring(0, 500));
        // Fallback: treat entire response as a single file
        return [{
            path: `components/${componentName}.tsx`,
            content: text,
            language: 'tsx',
            component: componentName,
            model: 'claude',
        }];
    }
}
