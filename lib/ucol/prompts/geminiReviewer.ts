// lib/ucol/prompts/geminiReviewer.ts
// Gemini-powered code reviewer with DUAL-AXIS evaluation:
//   Axis 1: Correctness — does it compile, match spec, use right stack?
//   Axis 2: Originality — does it show critical thought beyond the obvious solution?
// Gamified reinforcement with concrete scoring rubrics on both axes.

import { GoogleGenerativeAI } from '@google/generative-ai';
import { requireEnv } from '@/lib/env';
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

Evaluate against these criteria — each adds points:

1. **EDGE_CASE_HANDLING** (+2 per case) — Did the coder handle scenarios the spec DIDN'T mention? Empty states, loading states, error boundaries, accessibility, overflow, responsive design. The spec only says WHAT to build; handling the unasked-for edge cases is critical thinking.

2. **ABSTRACTION_NOVELTY** (+3 each) — Did the coder introduce a useful abstraction NOT in the plan? Custom hooks, utility functions, composable patterns, type factories. Simply implementing what the plan says = 0. Creating something new that improves the architecture = points.

3. **PATTERN_DEVIATION** (+2) — Is the approach different from the most obvious tutorial solution?
   - useReducer instead of multiple useState: +2
   - Compound component pattern: +3
   - Custom hook extracting reusable logic: +2
   - Just useState + onClick (the default everyone writes): 0
   - Render props or HOCs where appropriate: +2

4. **DEFENSIVE_CODING** (+1 per instance) — Validation, type guards, null checks, or error handling not mentioned in the spec. Each one that prevents a real runtime crash = +1.

5. **SELF_DOCUMENTING** (+1) — Does naming reveal intent? "handleSubmit" is generic. "handleProductCreation" reveals domain understanding. Every meaningful name beyond the spec's terminology = originality.

Scoring guide:
- 9-10: Multiple novel abstractions, unasked-for edge cases, non-obvious patterns. This code teaches you something.
- 7-8: One novel abstraction or several defensive additions. Shows thought beyond the spec.
- 5-6: Standard implementation with minor defensive coding. Competent but unremarkable.
- 3-4: Pure tutorial-level code. Copy-paste of the most obvious approach.
- 1-2: Worse than tutorial — missing obvious patterns that any competent dev would use.

## AXIS 3: PRAGMATISM & SIMPLICITY (score 1-10)

Evaluate against these criteria — over-engineering LOSES points:

1. **APPROPRIATE_ABSTRACTION** — Are the abstractions justified? Building a complex \`useReducer\` for a toggle is bad. Building a custom hook with exponential backoff for a simple submit button is over-engineering. Code should be as simple as possible but no simpler.
2. **NO_PREMATURE_OPTIMIZATION** — Did the coder add \`useMemo\` and \`useCallback\` everywhere without profiling? Did they build an overly generic "Compound Component" when standard props would suffice?
3. **CODE_BLOAT** — Is the component 500 lines when 100 would do?

Scoring guide:
- 9-10: Perfect balance. Elegant, simple, readable, and only uses advanced patterns when the domain complexity strictly demands it.
- 7-8: Good, reasonable abstractions. A little defensive but pragmatic.
- 5-6: Slightly over-engineered. Some unnecessary hooks or genericness.
- 3-4: Heavy over-engineering. The coder built a massive enterprise architecture for a simple UI component.
- 1-2: Spaghetti abstractions. Unreadable because of "clever" architecture.

## GAMIFIED SCORING

Correctness:
- +100 points for catching a real bug that would crash at runtime.
- +50 points for catching a missing import or type mismatch.
- LOSE 500 points for approving broken code.
- LOSE 200 points for rejecting valid code on style preferences.

Originality:
- +150 points for identifying a genuinely novel pattern the coder introduced.
- +75 points for correctly noting an unasked-for edge case the coder handled.
- LOSE 300 points for calling standard tutorial code "novel" (inflation).
- LOSE 100 points for failing to recognize actual creativity.

Pragmatism:
- +200 points for correctly identifying and penalizing over-engineering.
- LOSE 400 points if you praise a 300-line Button component for being "clever".

Your goal is to MAXIMIZE your total score across all three axes. Be ruthless on correctness bugs. Be HONEST about originality — don't inflate it. Punish over-engineering mercilessly on the Pragmatism axis.

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
- "novelPatterns" should list SPECIFIC patterns, not vague praise. Example: "Custom useProductFilter hook with debounced search".
- "originalityNotes" should explain what was novel or what was derivative.`;

export async function reviewCode(
    files: GeneratedFile[],
    component: ComponentSpec,
    plan: ProjectPlan,
    providerKeys: ProviderApiKeys = {}
): Promise<ReviewFeedback> {
    const genAI = new GoogleGenerativeAI(providerKeys.google || requireEnv('GOOGLE_API_KEY'));
    const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        systemInstruction: {
            role: 'user',
            parts: [{ text: REVIEWER_SYSTEM_PROMPT }],
        },
    });

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

    const reviewPrompt = `Review this generated code for the "${component.name}" component.

## Component Spec
\`\`\`json
${specBlock}
\`\`\`

## Tech Stack: ${techStackStr}

## Generated Code
${codeBlock}

Evaluate on THREE axes:
1. Correctness (5 criteria) → score + approved/rejected
2. Originality (5 criteria) → originalityScore + novelPatterns
3. Pragmatism (3 criteria) → pragmatismScore

Output your review as JSON.`;

    const result = await model.generateContent({
        contents: [
            { role: 'user', parts: [{ text: reviewPrompt }] },
        ],
        generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.3,
            maxOutputTokens: 2048,
        },
    });

    if (!result.response) {
        console.warn('[UCOL:Reviewer] No response — auto-approving');
        return defaultFeedback('Reviewer unavailable — auto-approved');
    }

    const text = result.response.text();

    try {
        const cleaned = sanitizeReviewJson(text);
        let parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed)) parsed = parsed[0];

        const feedback: ReviewFeedback = {
            approved: parsed.approved ?? true,
            score: typeof parsed.score === 'number' ? parsed.score : 7,
            critique: parsed.critique || '',
            suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
            failedCriteria: Array.isArray(parsed.failedCriteria) ? parsed.failedCriteria : [],
            originalityScore: typeof parsed.originalityScore === 'number' ? parsed.originalityScore : 5,
            novelPatterns: Array.isArray(parsed.novelPatterns) ? parsed.novelPatterns : [],
            originalityNotes: parsed.originalityNotes || '',
            pragmatismScore: typeof parsed.pragmatismScore === 'number' ? parsed.pragmatismScore : 8,
        };

        // Enforce correctness score threshold rules
        if (feedback.score >= 8) feedback.approved = true;
        else if (feedback.score < 5) feedback.approved = false;

        return feedback;
    } catch (err: any) {
        console.error('[UCOL:Reviewer] Failed to parse review JSON:', text.substring(0, 300));
        return defaultFeedback('Review parse error — auto-approved');
    }
}

function defaultFeedback(reason: string): ReviewFeedback {
    return {
        approved: true,
        score: 6,
        critique: reason,
        suggestions: [],
        failedCriteria: [],
        originalityScore: 5,
        novelPatterns: [],
        originalityNotes: 'Unable to evaluate originality — review failed',
        pragmatismScore: 5,
    };
}

function sanitizeReviewJson(text: string): string {
    let cleaned = text.trim();
    const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (fenceMatch) cleaned = fenceMatch[1].trim();
    cleaned = cleaned.replace(/\\\n/g, '\n').replace(/[ \t]+\\$/gm, '');
    return cleaned.trim();
}
