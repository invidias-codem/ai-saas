// lib/ucol/prompts/kimiReviewer.ts
// Kimi K3 code reviewer — replaces geminiReviewer.ts. Preserves the DUAL/THREE-axis
// evaluation contract (correctness / originality / pragmatism) and the stateful
// previousReviews handoff across debate-loop rounds.
import { nimChat } from './nimChat';
import type { ComponentSpec, ProjectPlan, ReviewFeedback, GeneratedFile } from '../types';
import type { ProviderApiKeys } from '@/lib/userProviderKeys';

const REVIEWER_SYSTEM_PROMPT = `You are the Lead QA Engineer AND Chief Architect rolled into one. You evaluate generated code on THREE independent axes.

## AXIS 1: CORRECTNESS (score 1-10)
Evaluate against these criteria:
1. **NO_TYPE_ERRORS** — All imports resolve. Props match the component spec interface. No undefined variables.
2. **NO_MISSING_IMPORTS** — Every used module/component has a corresponding import statement.
3. **RENDERS_WITHOUT_ERRORS** — No null access on potentially undefined values, no missing required props.
4. **MATCHES_SPEC** — Output matches the component description and implements described behavior.
5. **USES_TECH_STACK** — Uses specified tech stack (e.g., Tailwind CSS for styling, NOT inline styles).

Scoring: 9-10 all pass, 7-8 minor issues (approve), 5-6 one fails (reject), 1-4 multiple fail (reject).

## AXIS 2: ORIGINALITY (score 1-10)
Evaluate against these criteria:
1. **EDGE_CASE_HANDLING** — empty states, loading states, error boundaries, accessibility, overflow, responsive design.
2. **ABSTRACTION_NOVELTY** — custom hooks, utility functions, composable patterns, type factories.
3. **PATTERN_DEVIATION** — useReducer where fitting, compound patterns, custom hooks vs the default "useState + onClick".
4. **DEFENSIVE_CODING** — validation, type guards, null checks, error handling.
5. **SELF_DOCUMENTING** — naming reveals intent beyond generic "handleSubmit".

## AXIS 3: PRAGMATISM & SIMPLICITY (score 1-10)
1. **APPROPRIATE_ABSTRACTION** — abstractions must be justified.
2. **NO_PREMATURE_OPTIMIZATION** — no useMemo/useCallback everywhere without cause.
3. **CODE_BLOAT** — is the component 500 lines when 100 would do?

## OUTPUT FORMAT
Respond with a single JSON object:
{
  "approved": boolean,
  "score": number,
  "critique": "string",
  "suggestions": ["string"],
  "failedCriteria": ["string"],
  "originalityScore": number,
  "novelPatterns": ["string"],
  "originalityNotes": "string",
  "pragmatismScore": number
}

RULES:
- "approved" is determined ONLY by correctness score: >=8 auto-approve, <5 auto-reject.
- "originalityScore" and "pragmatismScore" are INDEPENDENT of approval.
- "novelPatterns" should list SPECIFIC patterns, not vague praise.
- "originalityNotes" should explain what was novel or what was derivative.`;

export async function reviewCode(
    files: GeneratedFile[],
    component: ComponentSpec,
    plan: ProjectPlan,
    providerKeys: ProviderApiKeys = {},
    options: {
        userPrompt?: string;
        dependencyFiles?: GeneratedFile[];
        previousReviews?: ReviewFeedback[];
    } = {}
): Promise<ReviewFeedback> {
    void providerKeys;
    const { userPrompt, dependencyFiles, previousReviews } = options;

    const codeBlock = files
        .map(f => `### ${f.path}\n\`\`\`${f.language}\n${f.content}\n\`\`\``)
        .join('\n\n');

    const specBlock = JSON.stringify({
        name: component.name,
        description: component.description,
        filePath: component.filePath,
        props: component.props,
        dependencies: component.dependencies,
    }, null, 2);

    const techStackStr = plan.techStack.join(', ');

    let reviewPrompt = `Review this generated code for the "${component.name}" component.`;

    if (userPrompt) {
        reviewPrompt += `\n\n## Original User Request\n${userPrompt}`;
    }

    reviewPrompt += `\n\n## Component Spec\n\`\`\`json\n${specBlock}\n\`\`\``;

    if (plan.dataModel && plan.dataModel.length > 0) {
        reviewPrompt += `\n\n## Data Model (verify types match exactly)`;
        for (const model of plan.dataModel) {
            reviewPrompt += `\n### ${model.name}`;
            for (const field of model.fields) {
                reviewPrompt += `\n- ${field.name}: ${field.type}`;
            }
        }
    }

    if (dependencyFiles && dependencyFiles.length > 0) {
        reviewPrompt += `\n\n## Dependency Files (verify imports resolve to these)`;
        for (const dep of dependencyFiles) {
            reviewPrompt += `\n### ${dep.path}\n\`\`\`${dep.language}\n${dep.content}\n\`\`\``;
        }
    }

    reviewPrompt += `\n\n## Tech Stack: ${techStackStr}`;

    if (previousReviews && previousReviews.length > 0) {
        reviewPrompt += `\n\n## Previous Review History`;
        for (let i = 0; i < previousReviews.length; i++) {
            const prev = previousReviews[i];
            reviewPrompt += `\n### Round ${i + 1}: ${prev.approved ? 'APPROVED' : 'REJECTED'} (correctness: ${prev.score}/10)`;
            if (prev.critique) reviewPrompt += `\nCritique: ${prev.critique}`;
            if (prev.suggestions.length > 0) reviewPrompt += `\nSuggestions: ${prev.suggestions.join('; ')}`;
        }
        reviewPrompt += `\n\nIMPORTANT: Check whether the issues flagged in previous rounds have been fixed. Do NOT re-approve if the same correctness issues persist.`;
    }

    reviewPrompt += `\n\n## Generated Code\n${codeBlock}\n\nEvaluate on THREE axes:\n1. Correctness → score + approved/rejected\n2. Originality → originalityScore + novelPatterns\n3. Pragmatism → pragmatismScore\n\nOutput your review as JSON.`;

    const { text } = await nimChat(REVIEWER_SYSTEM_PROMPT, reviewPrompt, {
        temperature: 0.3,
        maxTokens: 8192,
        reasoningEffort: 'high',
    });

    const cleaned = sanitizeReviewJson(text);
    let parsed: any;
    try {
        parsed = JSON.parse(cleaned);
    } catch (parseErr: any) {
        console.error('[UCOL:KimiReviewer] Failed to parse review JSON:', text.substring(0, 300));
        throw new Error('Review parse error — code gate failed');
    }
    if (Array.isArray(parsed)) parsed = parsed[0];

    const feedback: ReviewFeedback = {
        approved: parsed.approved ?? false,
        score: typeof parsed.score === 'number' ? parsed.score : 7,
        critique: parsed.critique || '',
        suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
        failedCriteria: Array.isArray(parsed.failedCriteria) ? parsed.failedCriteria : [],
        originalityScore: typeof parsed.originalityScore === 'number' ? parsed.originalityScore : 5,
        novelPatterns: Array.isArray(parsed.novelPatterns) ? parsed.novelPatterns : [],
        originalityNotes: parsed.originalityNotes || '',
        pragmatismScore: typeof parsed.pragmatismScore === 'number' ? parsed.pragmatismScore : 5,
    };

    if (feedback.score >= 8) feedback.approved = true;
    else if (feedback.score < 5) feedback.approved = false;

    return feedback;
}

function sanitizeReviewJson(text: string): string {
    let cleaned = text.trim();
    const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (fenceMatch) cleaned = fenceMatch[1].trim();
    cleaned = cleaned.replace(/\\\n/g, '\n').replace(/[ \t]+\$/gm, '');
    cleaned = cleaned.trim();

    try { JSON.parse(cleaned); return cleaned; } catch {}

    const start = cleaned.indexOf('{');
    if (start === -1) return cleaned;
    let inString = false, escaped = false;
    let lastGood = -1;
    for (let i = start; i < cleaned.length; i++) {
        const ch = cleaned[i];
        if (inString) {
            if (escaped) { escaped = false; continue; }
            if (ch === '\\') { escaped = true; continue; }
            if (ch === '"') { inString = false; lastGood = i + 1; }
            continue;
        }
        if (ch === '"') { inString = true; continue; }
        if (ch === '}' || ch === ']') lastGood = i + 1;
        else if (/[0-9a-zA-Z.]/.test(ch)) lastGood = i + 1;
    }
    if (lastGood > start) {
        let candidate = cleaned.slice(start, lastGood)
            .replace(/,\s*$/, '')
            .replace(/,?\s*"[^"]*"\s*:\s*$/, '')
            .replace(/([{,])\s*"[^"]*"\s*$/, '$1')
            .replace(/,\s*$/, '');
        const stack: string[] = [];
        let s = false, e = false;
        for (const ch of candidate) {
            if (s) { if (e) { e = false; continue; } if (ch === '\\') { e = true; continue; } if (ch === '"') s = false; continue; }
            if (ch === '"') { s = true; continue; }
            if (ch === '{') stack.push('}');
            else if (ch === '[') stack.push(']');
            else if (ch === '}' || ch === ']') stack.pop();
        }
        if (s) candidate += '"';
        while (stack.length) candidate += stack.pop();
        try { JSON.parse(candidate); return candidate; } catch {}
    }
    return cleaned;
}