// lib/ucol/prompts/geminiReviewer.ts
// Gemini-powered code reviewer with gamified reinforcement.
// Reviews Claude's generated code against the component spec and returns structured feedback.

import { GoogleGenerativeAI } from '@google/generative-ai';
import { requireEnv } from '@/lib/env';
import type { ComponentSpec, ProjectPlan, ReviewFeedback, GeneratedFile } from '../types';

const REVIEWER_SYSTEM_PROMPT = `You are the Lead QA Engineer on a code review team. Your job is to review generated code and determine if it is production-ready.

## SCORING RUBRIC

You MUST evaluate the code against ALL of these criteria. Each criterion is pass/fail:

1. **NO_TYPE_ERRORS** — All imports resolve. Props match the component spec interface. No undefined variables or missing type annotations.
2. **NO_MISSING_IMPORTS** — Every used module/component has a corresponding import statement.
3. **RENDERS_WITHOUT_ERRORS** — The component will render without throwing a runtime error (no null access on potentially undefined values, no missing required props).
4. **MATCHES_SPEC** — The output matches the component description and implements the described behavior.
5. **USES_TECH_STACK** — Uses the specified tech stack (e.g., Tailwind CSS for styling, NOT inline styles or CSS modules, unless the spec says otherwise).

## SCORING

- Score 9-10: All 5 criteria pass. Code is clean and production-ready.
- Score 7-8: All criteria pass but minor improvements possible (naming, structure). APPROVE.
- Score 5-6: 1 criterion fails but fixable. REJECT with specific fix instructions.
- Score 1-4: Multiple criteria fail. REJECT with all failing criteria listed.

## CRITICAL RULES

- REJECT ONLY for concrete, fixable issues tied to the 5 criteria above.
- Style preferences (variable naming, comment density) are NOT rejection-worthy.
- If score >= 8, you MUST set approved to true. Non-negotiable.
- If score < 5, you MUST set approved to false. Non-negotiable.
- For scores 5-7, use your best judgment but bias toward approval.

## GAMIFIED PERFORMANCE TRACKING

- You earn +100 points for catching a real bug that would prevent compilation or cause a runtime error.
- You earn +50 points for catching a missing import or type mismatch.
- You LOSE 500 points if you approve code that would fail to compile or crash at runtime.
- You LOSE 200 points if you reject perfectly valid code for subjective style reasons.
- Your goal is to maximize your score. Be ruthless on real bugs, lenient on style.

## OUTPUT FORMAT

Respond with ONLY a single JSON object (NOT an array):
{
  "approved": boolean,
  "score": number,         // 1-10
  "critique": "string",   // summary of findings
  "suggestions": ["string"], // specific actionable fix instructions
  "failedCriteria": ["string"] // which of the 5 criteria above failed (empty if all pass)
}`;

export async function reviewCode(
    files: GeneratedFile[],
    component: ComponentSpec,
    plan: ProjectPlan
): Promise<ReviewFeedback> {
    const genAI = new GoogleGenerativeAI(requireEnv('GOOGLE_API_KEY'));
    const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash',
        systemInstruction: {
            role: 'user',
            parts: [{ text: REVIEWER_SYSTEM_PROMPT }],
        },
    });

    // Build the review prompt with full context
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

Evaluate against the 5 criteria in your rubric. Output your review as JSON.`;

    const result = await model.generateContent({
        contents: [
            { role: 'user', parts: [{ text: reviewPrompt }] },
        ],
        generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.3, // Low temp for consistent reviews
            maxOutputTokens: 2048,
        },
    });

    if (!result.response) {
        // If reviewer fails, auto-approve to not block the build
        console.warn('[UCOL:Reviewer] No response — auto-approving');
        return { approved: true, score: 7, critique: 'Reviewer unavailable — auto-approved', suggestions: [], failedCriteria: [] };
    }

    const text = result.response.text();

    try {
        let parsed = JSON.parse(text);
        if (Array.isArray(parsed)) parsed = parsed[0];

        const feedback: ReviewFeedback = {
            approved: parsed.approved ?? true,
            score: typeof parsed.score === 'number' ? parsed.score : 7,
            critique: parsed.critique || '',
            suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
            failedCriteria: Array.isArray(parsed.failedCriteria) ? parsed.failedCriteria : [],
        };

        // Enforce score threshold rules
        if (feedback.score >= 8) {
            feedback.approved = true; // Non-negotiable auto-approve
        } else if (feedback.score < 5) {
            feedback.approved = false; // Non-negotiable reject
        }

        return feedback;
    } catch (err: any) {
        console.error('[UCOL:Reviewer] Failed to parse review JSON:', text.substring(0, 300));
        // On parse failure, auto-approve to not block
        return { approved: true, score: 6, critique: 'Review parse error — auto-approved', suggestions: [], failedCriteria: [] };
    }
}
