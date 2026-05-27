// lib/ucol/prompts/geminiPlanner.ts
// Gemini planning integration — generates a structured ProjectPlan from a user prompt.

import { GoogleGenerativeAI } from '@google/generative-ai';
import { requireEnv } from '@/lib/env';
import type { ContextPackage, ProjectPlan } from '../types';

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

export async function generatePlan(contextPackage: ContextPackage): Promise<ProjectPlan> {
    const { prompt, userId, availableDependencies } = contextPackage.payload.content;

    const genAI = new GoogleGenerativeAI(requireEnv('GOOGLE_API_KEY'));
    const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        systemInstruction: {
            role: 'user',
            parts: [{ text: PLANNER_SYSTEM_PROMPT }],
        },
    });

    let userPrompt = `Build this app: ${prompt}`;

    // Inject available dependencies so technStack is constrained
    if (availableDependencies && availableDependencies.length > 0) {
        userPrompt += `\n\n## AVAILABLE DEPENDENCIES (from package.json)\nYou MUST constrain your techStack to ONLY these installed packages:\n${availableDependencies.join(', ')}\n\nDo NOT add any packages that are not in this list.`;
    }

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
            maxOutputTokens: 8192,
        },
    });

    if (!result.response) {
        throw new Error('[UCOL:Gemini] No response received from planning model');
    }

    const text = result.response.text();

    try {
        let parsed = JSON.parse(text);

        // Gemini sometimes wraps the plan in an array — unwrap it
        if (Array.isArray(parsed)) {
            if (parsed.length === 0) {
                throw new Error('Gemini returned an empty array');
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
        console.error('[UCOL:Gemini] Failed to parse plan JSON:', text.substring(0, 500));
        throw new Error(`[UCOL:Gemini] Plan parsing failed: ${parseError.message}`);
    }
}
