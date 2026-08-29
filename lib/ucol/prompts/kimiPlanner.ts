// lib/ucol/prompts/kimiPlanner.ts
// Kimi K3 planning — generates a structured ProjectPlan from a user prompt.
// Replaces geminiPlanner.ts. Routes through NVIDIA NIM (moonshotai/kimi-k3).
import { nimChat } from './nimChat';
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
- HARD LIMIT: at most 12 components. Consolidate small pieces into their parent rather than exceeding this.
- Keep every "description" and "reasoning" under 2 sentences. Output compact JSON — the response must stay well under the token limit or it will be cut off mid-string and rejected.

Output a single JSON object (NOT an array). No markdown fences, no explanation text.`;

export async function generatePlan(contextPackage: ContextPackage, providerKeys: ProviderApiKeys = {}): Promise<ProjectPlan> {
    // providerKeys retained in the signature for call-site compatibility;
    // Kimi K3 uses the platform NVIDIA_API_KEY (no per-user override yet).
    void providerKeys;
    const { prompt, userId, availableDependencies } = contextPackage.payload.content;
    void userId;

    let userPrompt = `Build this app: ${prompt}`;

    if (availableDependencies && availableDependencies.length > 0) {
        userPrompt += `\n\n## AVAILABLE DEPENDENCIES (from package.json)\nYou MUST constrain your techStack to ONLY these installed packages:\n${availableDependencies.join(', ')}\n\nDo NOT add any packages that are not in this list.`;
    }

    const { text } = await nimChat(PLANNER_SYSTEM_PROMPT, userPrompt, {
        temperature: 0.7,
        maxTokens: 16384,
        reasoningEffort: 'high',
    });

    return parseAndValidatePlan(text);
}

// Salvage JSON that was cut off mid-output (token-limit truncation).
// Walks the text tracking string/escape state and bracket depth, trims any
// dangling partial value, then closes every open bracket.
function repairTruncatedJson(text: string): string | null {
    const start = text.indexOf('{');
    if (start === -1) return null;
    let inString = false;
    let escaped = false;
    const stack: string[] = [];
    let lastGood = -1;

    for (let i = start; i < text.length; i++) {
        const ch = text[i];
        if (inString) {
            if (escaped) { escaped = false; continue; }
            if (ch === '\\') { escaped = true; continue; }
            if (ch === '"') { inString = false; lastGood = i + 1; }
            continue;
        }
        if (ch === '"') { inString = true; continue; }
        if (ch === '{' || ch === '[') { stack.push(ch === '{' ? '}' : ']'); continue; }
        if (ch === '}' || ch === ']') { stack.pop(); lastGood = i + 1; continue; }
        if (/[0-9el]/.test(ch) || ch === 't' || ch === 'f') { lastGood = i + 1; }
    }

    if (lastGood <= start) return null;
    let candidate = text.slice(start, lastGood);
    candidate = candidate
        .replace(/,\s*$/, '')
        .replace(/,?\s*"[^"]*"\s*:\s*$/, '')
        .replace(/([{,])\s*"[^"]*"\s*$/, '$1')
        .replace(/,\s*$/, '')
        .replace(/\{\s*$/, '')
        .replace(/,\s*$/, '');

    const closeStack: string[] = [];
    let inStr = false, esc = false;
    for (const ch of candidate) {
        if (inStr) {
            if (esc) { esc = false; continue; }
            if (ch === '\\') { esc = true; continue; }
            if (ch === '"') inStr = false;
            continue;
        }
        if (ch === '"') { inStr = true; continue; }
        if (ch === '{') closeStack.push('}');
        else if (ch === '[') closeStack.push(']');
        else if (ch === '}' || ch === ']') closeStack.pop();
    }
    if (inStr) candidate += '"';
    while (closeStack.length) candidate += closeStack.pop();
    return candidate;
}

function parseAndValidatePlan(text: string): ProjectPlan {
    let cleaned = text.trim();
    const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (fenceMatch) cleaned = fenceMatch[1].trim();

    try {
        let parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed)) {
            if (parsed.length === 0) throw new Error('Kimi returned an empty array');
            parsed = parsed[0];
        }
        const plan: ProjectPlan = parsed;
        if (!plan.appName || !plan.components || !Array.isArray(plan.components)) {
            throw new Error('Invalid plan structure: missing appName or components');
        }
        for (const comp of plan.components) {
            if (!Array.isArray(comp.dependencies)) comp.dependencies = [];
            if (!Array.isArray(comp.props)) comp.props = [];
        }
        return plan;
    } catch (parseError: any) {
        try {
            let repaired = cleaned
                .replace(/'/g, '"')
                .replace(/,\s*}/g, '}')
                .replace(/,\s*\]/g, ']')
                .replace(/\/\*[\s\S]*?\*\//g, '')
                .replace(/\/\/.*$/gm, '');
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
            console.warn('[UCOL:Kimi] Repaired malformed plan JSON');
            return plan;
        } catch {
            try {
                const salvaged = repairTruncatedJson(cleaned);
                if (!salvaged) throw parseError;
                let parsed = JSON.parse(salvaged);
                if (Array.isArray(parsed)) parsed = parsed[0];
                const plan: ProjectPlan = parsed;
                if (!plan.appName || !plan.components || !Array.isArray(plan.components) || plan.components.length === 0) {
                    throw new Error('Salvaged plan missing appName/components');
                }
                for (const comp of plan.components) {
                    if (!Array.isArray(comp.dependencies)) comp.dependencies = [];
                    if (!Array.isArray(comp.props)) comp.props = [];
                }
                plan.reasoning = plan.reasoning || 'Plan recovered from truncated model output';
                console.warn(`[UCOL:Kimi] Salvaged truncated plan JSON (${plan.components.length} components)`);
                return plan;
            } catch {
                console.error('[UCOL:Kimi] Failed to parse plan JSON:', text.substring(0, 500));
                throw new Error(`[UCOL:Kimi] Plan parsing failed: ${parseError.message}`);
            }
        }
    }
}