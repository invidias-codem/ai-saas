// lib/ucol/prompts/claudeCoder.ts
// Claude code generation — generates component files from a plan + context.
// Supports iterative refinement, discovered patterns from earlier components,
// and creativity constraints for low-originality revisions.

import Anthropic from '@anthropic-ai/sdk';
import type { ContextPackage, GeneratedFile, RefinementContext, DiscoveredPattern } from '../types';
import type { ProviderApiKeys } from '@/lib/userProviderKeys';

const CODER_SYSTEM_PROMPT = `You are an expert React/Next.js developer who writes code that goes BEYOND the spec.

You will receive:
- The component spec (name, props, description, file path)
- The full project plan (for context on the overall app)
- Already-generated dependency files (so you can import correctly)
- The tech stack
- Possibly: novel patterns discovered in earlier components — reuse and build on them

RULES:
- Generate ONLY the code for the requested component.
- Use TypeScript with proper type annotations.
- Use Tailwind CSS for styling (utility-first).
- Import dependencies using relative paths based on the file structure.
- Include proper React imports ("use client" directive where needed).
- If the component is a page, export it as default.
- If the component is a reusable UI element, use named exports.

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
- Do NOT build "exponential backoff retry hooks" for a basic submit button unless strictly necessary.
- Your code is evaluated on Correctness (1-10), Originality (1-10), AND Pragmatism (1-10). If you over-engineer and bloat the code, you will be rejected on the Pragmatism axis. Keep it elegant, readable, and appropriately scoped.

Your code is reviewed by a Lead QA Engineer. Tutorial-level code gets sent back for low Originality. Over-engineered code gets sent back for low Pragmatism.

OUTPUT FORMAT:
Return a JSON array of file objects. Each object has:
- "path": string (e.g., "components/TodoList.tsx")  
- "content": string (the full file source code)
- "language": string (e.g., "tsx", "ts")

Output ONLY valid JSON. No markdown fences, no explanation text.`;

const REFINEMENT_ADDENDUM = `

## ⚠️ REVISION REQUIRED

A Lead QA Engineer reviewed your previous code. You must fix every flagged issue immediately without arguing or over-explaining. Fix the problems, output the corrected JSON, and nothing else.`;

const CONSTRAINT_ADDENDUM = `

## 🎯 CREATIVITY CONSTRAINT

Your previous implementation was scored low on originality. You MUST now rewrite the component while satisfying the constraint below. This is non-negotiable — standard tutorial-level code will be rejected again.`;

function getAnthropicClient(apiKeyOverride?: string): Anthropic {
    const apiKey = apiKeyOverride || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    }
    return new Anthropic({ apiKey });
}

function sanitizeReviewJson(text: string): string {
    let cleaned = text.trim();
    const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (fenceMatch) cleaned = fenceMatch[1].trim();
    cleaned = cleaned.replace(/\\\n/g, '\n').replace(/[ \t]+\\$/gm, '');
    return cleaned.trim();
}

// Enriched plan summary — includes dataModel, apiRoutes, and reasoning
// so the coder doesn't hallucinate types or violate architectural constraints.
function buildPlanContext(plan: any): string {
    const lines = [
        `App: ${plan.appName}`,
        `Description: ${plan.description}`,
        `Tech stack: ${(plan.techStack || []).join(', ')}`,
        `Components: ${(plan.components || []).map((c: any) => c.name).join(', ')}`,
    ];

    // Include reasoning (architectural decisions)
    if (plan.reasoning) {
        lines.push(`\n## Architecture Reasoning\n${plan.reasoning}`);
    }

    // Include data model (type definitions the coder MUST use)
    if (plan.dataModel && plan.dataModel.length > 0) {
        lines.push('\n## Data Model (use these exact types)');
        for (const model of plan.dataModel) {
            lines.push(`\n### ${model.name}`);
            for (const field of model.fields) {
                lines.push(`- ${field.name}: ${field.type} — ${field.description}`);
            }
        }
    }

    // Include API routes (contracts the coder must respect)
    if (plan.apiRoutes && plan.apiRoutes.length > 0) {
        lines.push('\n## API Routes');
        for (const route of plan.apiRoutes) {
            lines.push(`- ${route.method} ${route.path} — ${route.description}`);
        }
    }

    return lines.join('\n');
}

// Trim dependency file content — increased to 1500 chars to capture
// exported types, hooks, and function signatures that the coder needs.
function trimDependencyContent(files: GeneratedFile[]): string {
    if (!files || files.length === 0) return '(none — this is a leaf component)';
    return files.map(f => {
        const preview = f.content.length > 1500 ? f.content.substring(0, 1500) + '\n// ... (truncated)' : f.content;
        return `### ${f.path}\n\`\`\`${f.language}\n${preview}\n\`\`\``;
    }).join('\n\n');
}

export async function generateComponent(
    contextPackage: ContextPackage,
    refinement?: RefinementContext,
    discoveredPatterns?: DiscoveredPattern[],
    providerKeys: ProviderApiKeys = {}
): Promise<GeneratedFile[]> {
    const { component, fullPlan, existingFiles, techStack } = contextPackage.payload.content;

    const anthropic = getAnthropicClient(providerKeys.anthropic);

    let userPrompt = `## Project Context
${buildPlanContext(fullPlan)}

## Component to Build
Name: ${component.name}
File: ${component.filePath}
Description: ${component.description}
Props: ${JSON.stringify(component.props)}
Dependencies: ${(component.dependencies || []).join(', ') || 'none'}

## Already Built Dependencies
${trimDependencyContent(existingFiles || [])}

## Tech Stack
${(techStack || []).join(', ')}`;

    // Inject discovered patterns from earlier components
    if (discoveredPatterns && discoveredPatterns.length > 0) {
        userPrompt += `\n\n## 💡 Novel Patterns Discovered by Your Team
The following patterns were introduced in earlier components and scored highly for originality. Reuse or build on them where appropriate:

${discoveredPatterns.map((p, i) => `${i + 1}. **${p.component}** — ${p.pattern} (originality: ${p.originalityScore}/10)\n   Example: ${p.example}`).join('\n\n')}`;
    }

    // If this is a refinement, append the full feedback chain
    if (refinement && refinement.feedbackHistory.length > 0) {
        userPrompt += `\n\n---\n## REVISION ATTEMPT ${refinement.attempt}\n`;
        userPrompt += `\n### Your Previous Code\n\`\`\`\n${refinement.previousCode}\n\`\`\`\n`;

        // If there's a creativity constraint, highlight it
        if (refinement.constraint) {
            userPrompt += `\n### 🎯 CREATIVITY CONSTRAINT\n**${refinement.constraint}**\n\nYou MUST satisfy this constraint in your revision.\n`;
        }

        userPrompt += `\n### Review Feedback History (ALL rounds)\n`;
        for (let i = 0; i < refinement.feedbackHistory.length; i++) {
            const fb = refinement.feedbackHistory[i];
            userPrompt += `\n**Round ${i + 1}** (Correctness: ${fb.score}/10, Originality: ${fb.originalityScore}/10, Pragmatism: ${fb.pragmatismScore}/10, ${fb.approved ? 'Approved' : 'Rejected'})\n`;
            userPrompt += `- Critique: ${fb.critique}\n`;
            if (fb.originalityNotes) {
                userPrompt += `- Originality notes: ${fb.originalityNotes}\n`;
            }
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

    // Select the right system prompt
    let systemPrompt = CODER_SYSTEM_PROMPT;
    if (refinement?.constraint) {
        systemPrompt += CONSTRAINT_ADDENDUM;
    } else if (refinement && refinement.feedbackHistory.length > 0) {
        systemPrompt += REFINEMENT_ADDENDUM;
    }

    const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 4096, // 8192 → 4096: components rarely need more; cuts latency ~40%
        system: systemPrompt,
        messages: [
            { role: 'user', content: userPrompt },
        ],
    }).catch(async (err: any) => {
        console.error('[UCOL:Claude] API error:', {
            status: err.status,
            error: err.error,
            message: err.message,
            model: 'claude-sonnet-4-5',
        });
        if (err.status === 404) {
            return await anthropic.messages.create({
                model: 'claude-haiku-4-5',
                max_tokens: 4096,
                system: systemPrompt,
                messages: [{ role: 'user', content: userPrompt }],
            });
        }
        throw err;
    });

    const responseText = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map(block => block.text)
        .join('');

    return parseGeneratedFiles(responseText, component.name);
}

function parseGeneratedFiles(text: string, componentName: string): GeneratedFile[] {
    let jsonStr = text.trim();

    const fenceMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (fenceMatch) jsonStr = fenceMatch[1].trim();

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
        return [{
            path: `components/${componentName}.tsx`,
            content: text,
            language: 'tsx',
            component: componentName,
            model: 'claude',
        }];
    }
}
