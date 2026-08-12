// lib/ucol/prompts/geminiPlanner.ts
// Planning integration — generates a structured ProjectPlan from a user prompt.
// Uses OpenAI GPT-4 (primary), Anthropic fallback, then Gemini fallback.

import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { requireEnv } from '@/lib/env';
import type { ContextPackage, ProjectPlan } from '../types';
import type { ProviderApiKeys } from '@/lib/userProviderKeys';

const PLANNER_SYSTEM_PROMPT = `You are an expert software architect. Given a user's app description, produce a detailed project plan as structured JSON.

Your plan MUST include:
1. "appName" — a concise name for the project
2. "description" — one-sentence summary of the app
3. "techStack" — array of technologies (default: ["Next.js", "TypeScript", "Tailwind CSS", "React"])
4. "pages" — array of page specs with { name, route, description, components[] }
5. "components" — array of component specs with { name, filePath, description, props[], dependencies[], priority }
   - filePath should look like "components/TodoList.tsx" or "app/page.tsx"
   - dependencies is an array of OTHER component names this component imports
   - priority: lower number = build first (leaf components should be 0)
6. "dataModel" — array of data models with { name, fields[] } where each field has { name, type, description }
7. "apiRoutes" — array of API route specs with { path, method, description }
8. "reasoning" — your explanation of the architectural decisions you made

CRITICAL RULES:
- Components with NO dependencies should have priority 0.
- A component's dependencies MUST only reference other components in your list.
- Think in terms of a dependency graph. Leaf nodes first, composed nodes later.
- Be specific enough that each component can be built independently given its dependencies.
- Generate a COMPLETE app. Include layout, pages, and all UI components.
- For props, use TypeScript type syntax (e.g., "string", "number", "() => void", "Todo[]").
- For techStack, ONLY list packages that are in the AVAILABLE DEPENDENCIES provided below. Do NOT add packages that aren't installed.

Output a single JSON object (NOT an array). No markdown fences, no explanation text.`;

export async function generatePlan(contextPackage: ContextPackage, providerKeys: ProviderApiKeys = {}): Promise<ProjectPlan> {
    const { prompt, userId, availableDependencies } = contextPackage.payload.content;

    let userPrompt = `Build this app: ${prompt}`;

    // Inject available dependencies so techStack is constrained
    if (availableDependencies && availableDependencies.length > 0) {
        userPrompt += `\n\n## AVAILABLE DEPENDENCIES (from package.json)\nYou MUST constrain your techStack to ONLY these installed packages:\n${availableDependencies.join(', ')}\n\nDo NOT add any packages that are not in this list.`;
    }

    // Try OpenAI first (higher token limits, better JSON adherence)
    try {
        const openaiApiKey = providerKeys.openai || process.env.OPENAI_API_KEY;
        if (openaiApiKey) {
            const openai = new OpenAI({ apiKey: openaiApiKey });
            const completion = await openai.chat.completions.create({
                model: 'gpt-4o',
                messages: [
                    { role: 'system', content: PLANNER_SYSTEM_PROMPT },
                    { role: 'user', content: userPrompt }
                ],
                response_format: { type: 'json_object' },
                max_tokens: 16384, // Higher limit for complex apps
                temperature: 0.7,
            });

            const text = completion.choices[0]?.message?.content;
            if (text) {
                return parseAndValidatePlan(text, 'OpenAI');
            }
        }
    } catch (openaiError: any) {
        console.warn('[UCOL:OpenAI] Planning failed, falling back to Anthropic:', openaiError.message);
    }

    // Try Anthropic before Gemini. This keeps Code Builder usable when Google
    // temporarily blocks unrestricted Gemini API keys, and reuses the Claude key
    // already required by the code-generation phase.
    try {
        const anthropicApiKey = providerKeys.anthropic || process.env.ANTHROPIC_API_KEY;
        if (anthropicApiKey) {
            const anthropic = new Anthropic({ apiKey: anthropicApiKey });
            const response = await anthropic.messages.create({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 8192,
                temperature: 0.7,
                system: PLANNER_SYSTEM_PROMPT,
                messages: [{ role: 'user', content: userPrompt }],
            }).catch(async (anthropicError: any) => {
                // Claude Sonnet 4 may 404 on accounts without access; fall back to
                // the stable 3.5 snapshot so planning still succeeds.
                if (anthropicError?.status === 404) {
                    return await anthropic.messages.create({
                        model: 'claude-3-5-sonnet-20241022',
                        max_tokens: 8192,
                        temperature: 0.7,
                        system: PLANNER_SYSTEM_PROMPT,
                        messages: [{ role: 'user', content: userPrompt }],
                    });
                }
                throw anthropicError;
            });

            const text = response.content
                .filter((block): block is Anthropic.TextBlock => block.type === 'text')
                .map((block) => block.text)
                .join('');

            if (text) {
                return parseAndValidatePlan(text, 'Anthropic');
            }
        }
    } catch (anthropicError: any) {
        console.warn('[UCOL:Anthropic] Planning failed, falling back to Gemini:', anthropicError.message);
    }

    // Final fallback to Gemini with increased token limit
    const genAI = new GoogleGenerativeAI(providerKeys.google || requireEnv('GOOGLE_API_KEY'));
    const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        systemInstruction: {
            role: 'user',
            parts: [{ text: PLANNER_SYSTEM_PROMPT }],
        },
    });

    try {
        const result = await model.generateContent({
            contents: [
                {
                    role: 'user',
                    parts: [{ text: userPrompt }],
                },
            ],
            generationConfig: {
                responseMimeType: 'application/json',
                temperature: 0.7,
                maxOutputTokens: 16384, // Increased from 8192 to handle complex apps
            },
        });

        if (!result.response) {
            throw new Error('[UCOL:Gemini] No response received from planning model');
        }

        const text = result.response.text();
        return parseAndValidatePlan(text, 'Gemini');
    } catch (geminiError: any) {
        if (isUnrestrictedGoogleKeyError(geminiError)) {
            throw new Error(
                '[UCOL:Gemini] Google blocked this unrestricted Gemini API key. Restrict GOOGLE_API_KEY in Google Cloud Console to the Generative Language API, or replace it with a newly restricted key. Code Builder can avoid this path when OPENAI_API_KEY or ANTHROPIC_API_KEY is configured.'
            );
        }
        throw geminiError;
    }
}

export function isUnrestrictedGoogleKeyError(error: unknown): boolean {
    const candidate = error as { status?: number; message?: string; statusText?: string };
    const message = `${candidate?.message ?? ''} ${candidate?.statusText ?? ''}`.toLowerCase();
    return candidate?.status === 403 && message.includes('unrestricted') && message.includes('gemini');
}

function parseAndValidatePlan(text: string, provider: string): ProjectPlan {
    let cleaned = text.trim();
    // Strip markdown fences if present
    const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (fenceMatch) cleaned = fenceMatch[1].trim();

    try {
        let parsed = JSON.parse(cleaned);

        // Sometimes wraps the plan in an array — unwrap it
        if (Array.isArray(parsed)) {
            if (parsed.length === 0) {
                throw new Error(`${provider} returned an empty array`);
            }
            parsed = parsed[0];
        }

        const plan: ProjectPlan = parsed;

        // Validation: ensure required fields exist
        if (!plan.appName || !plan.components || !Array.isArray(plan.components)) {
            throw new Error('Invalid plan structure: missing appName or components');
        }

        // Ensure every component has a dependencies array
        for (const comp of plan.components) {
            if (!Array.isArray(comp.dependencies)) {
                comp.dependencies = [];
            }
            if (!Array.isArray(comp.props)) {
                comp.props = [];
            }
        }

        return plan;
    } catch (parseError: any) {
        // Lenient repair: try to fix common Gemini formatting issues
        try {
            let repaired = cleaned
                .replace(/'/g, '"')
                .replace(/,\s*}/g, '}')
                .replace(/,\s*\]/g, ']')
                .replace(/\/\*[\s\S]*?\*\//g, '') // strip block comments
                .replace(/\/\/.*$/gm, ''); // strip line comments

            let parsed = JSON.parse(repaired);
            if (Array.isArray(parsed)) parsed = parsed[0];
            const plan: ProjectPlan = parsed;

            if (!plan.appName || !plan.components || !Array.isArray(plan.components)) {
                throw new Error('Invalid plan structure after repair');
            }

            for (const comp of plan.components) {
                if (!Array.isArray(comp.dependencies)) comp.dependencies = [];
                if (!Array.isArray(comp.props)) comp.props = [];
            }

            console.warn(`[UCOL:${provider}] Repaired malformed plan JSON`);
            return plan;
        } catch {
            console.error(`[UCOL:${provider}] Failed to parse plan JSON:`, text.substring(0, 500));
            throw new Error(`[UCOL:${provider}] Plan parsing failed: ${parseError.message}`);
        }
    }
}
