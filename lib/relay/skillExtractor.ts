import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { supabase } from '@/lib/supabaseClient';
import type { SkillExtractionResult } from './types';
import { generateEmbeddingWithMetadata } from '@/lib/memory/embedding';

// Constants
const CLAUDE_MODEL = 'claude-3-7-sonnet-20250219';
const GEMINI_MODEL = 'gemini-2.5-flash';

function getAnthropicClient(): Anthropic {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error('ANTHROPIC_API_KEY is missing');
    return new Anthropic({ apiKey: key });
}

function getGeminiClient(): GoogleGenerativeAI {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error('GEMINI_API_KEY is missing');
    return new GoogleGenerativeAI(key);
}

/**
 * Pass 1: Gate (Gemini Flash, cheap)
 * Evaluates whether a trajectory is worth extracting into a formal skill.
 */
async function evaluateSkillPromotion(
    taskDescription: string,
    rewardScore: number,
    userId: string
): Promise<{ promote: boolean; reason: string }> {
    // 1. Basic threshold check
    if (rewardScore < 0.7) {
        return { promote: false, reason: 'Reward score too low for skill extraction.' };
    }

    // 2. Check if we already have a similar skill
    try {
        const embeddingResult = await generateEmbeddingWithMetadata(taskDescription);
        const rpcName = embeddingResult.dimension === 768 ? 'match_relay_skills_768' : 'match_relay_skills_3072';

        const { data: existingSkills } = await supabase.rpc(rpcName, {
            query_embedding: embeddingResult.vector,
            match_threshold: 0.85,
            match_count: 1
        });

        if (existingSkills && existingSkills.length > 0) {
            return { promote: false, reason: 'A highly similar skill already exists.' };
        }
    } catch (e) {
        console.warn('[SkillExtractor] Error checking existing skills, proceeding to LLM gate', e);
    }

    if (rewardScore > 0.85) {
        // High reward and never seen before -> automatic promote
        return { promote: true, reason: 'High reward score and novel pattern.' };
    }

    // 3. Fallback to Gemini for edge cases or borderline rewards
    const genAI = getGeminiClient();
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const prompt = `
You are evaluating whether a specific task execution trajectory should become a formal reusable skill.
Task Description: "${taskDescription}"
Reward Score: ${rewardScore} (Scale 0-1)

If this is a generic reusable workflow (like "deploy a PR", "format code", "create an issue"), reply "YES".
If this is highly specific to a single unique item (like "fix typo in word 'the' on line 42") or a one-off question, reply "NO".
Reply only YES or NO.
`;
    
    try {
        const response = await model.generateContent(prompt);
        const text = response.response.text().trim().toUpperCase();
        if (text.includes('YES')) {
            return { promote: true, reason: 'LLM evaluated as reusable workflow.' };
        }
        return { promote: false, reason: 'LLM evaluated as non-reusable or one-off.' };
    } catch (e) {
        console.warn('[SkillExtractor] Gemini evaluation failed', e);
        return { promote: false, reason: 'Gate evaluation failed.' };
    }
}

/**
 * Pass 2: Extraction (Claude Sonnet)
 * Transforms the raw trajectory into a .sudo.md generalized skill.
 */
async function extractSkillWithClaude(
    trajectory: any,
    taskDescription: string,
    rewardScore: number,
    userProfileSummary: string
): Promise<string | null> {
    const anthropic = getAnthropicClient();

    const systemPrompt = `You are a Skill Extractor for an autonomous AI agent called Relay.
Your job is to transform a specific task execution trajectory into a
REUSABLE, GENERALIZED skill definition in SudoLang format.

CORE RULE — The Stranger Test:
A skill is only valid if a different user, working on a different project,
with different file names and IDs, could use it verbatim. If the skill
contains any specific values (file paths, IDs, usernames, repo names,
PR numbers, dates), you have FAILED the abstraction step.

OUTPUT FORMAT — SudoLang Skill (.sudo.md):
\`\`\`markdown
---
skill_id: <snake_case_unique_id>
version: 1
trigger_pattern: <natural language description of when this applies>
confidence_threshold: <minimum memory confidence to auto-invoke, 0.0–1.0>
requires_approval: <true|false>
---

# Skill: <Human-Readable Name>

## Inputs
interface SkillInputs {
  <param_name>: <type>  // <description of what this is>
}

## Preconditions
- <what must be true for this skill to work>

## Steps
1. [TOOL] <tool_name>: <what to do>
   - On success: <what the observation confirms>
   - On failure: <what to do instead — always provide a fallback>
2. [DECISION] <condition to evaluate>
   - If <condition>: proceed to step 3
   - Else: <abort with reason | try alternative>
3. [TOOL] <tool_name>: <what to do with {param_name} substituted>

## Success Criteria
- <observable signal that confirms success>

## Memory Writeback
- scope: <which memory scope to update after success>
- kind: <fact | preference | observation>
- content_template: "<what to write, using {param} slots>"
\`\`\`

ABSTRACTION RULES (apply these before writing the skill):
1. Replace every specific value with a {typed_slot}: PR numbers → {pr_number: number},
   repo names → {repo: string}, file paths → {target_path: string}
2. Replace every user-specific fact with a precondition check
3. If a step failed and was retried, include the retry logic as a named failure mode
4. If the user confirmed the result, set requires_approval: false for safe versions
5. The trigger_pattern must match the INTENT, not the specific request
   BAD:  "User wants to deploy PR #42"
   GOOD: "User wants to deploy after verifying a pull request is merged"

Return ONLY the markdown block starting with \`\`\`markdown and ending with \`\`\`. Do not include conversational filler.
`;

    const userMessage = `
INPUT:
- trajectory: ${JSON.stringify(trajectory, null, 2)}
- task_description: "${taskDescription}"
- reward_score: ${rewardScore}
- user_profile_summary: "${userProfileSummary}"
`;

    try {
        const response = await anthropic.messages.create({
            model: CLAUDE_MODEL,
            max_tokens: 2000,
            system: systemPrompt,
            messages: [{ role: 'user', content: userMessage }]
        });

        const textBlock = response.content.find(b => b.type === 'text');
        if (!textBlock || textBlock.type !== 'text') return null;

        let content = textBlock.text.trim();
        // Extract from markdown block if present
        if (content.startsWith('```markdown')) {
            content = content.replace(/^```markdown\n/, '').replace(/\n```$/, '');
        } else if (content.startsWith('```')) {
            content = content.replace(/^```\n/, '').replace(/\n```$/, '');
        }
        return content;
    } catch (e) {
        console.error('[SkillExtractor] Claude extraction failed', e);
        return null;
    }
}

/**
 * Main export to process an interaction into a skill if it qualifies.
 */
export async function processTrajectoryForSkill(
    userId: string,
    taskDescription: string,
    trajectory: any,
    rewardScore: number,
    userProfileSummary: string = ''
): Promise<SkillExtractionResult> {
    
    // Pass 1: Gate
    const gateResult = await evaluateSkillPromotion(taskDescription, rewardScore, userId);
    if (!gateResult.promote) {
        return { passedGate: false, reason: gateResult.reason };
    }

    // Pass 2: Extract
    const skillContent = await extractSkillWithClaude(trajectory, taskDescription, rewardScore, userProfileSummary);
    if (!skillContent) {
        return { passedGate: true, reason: 'Extraction failed to generate valid content.' };
    }

    // Parse Frontmatter to get metadata for the DB
    const fmMatch = skillContent.match(/^---\n([\s\S]*?)\n---/);
    let skillId = `skill_${Date.now()}`;
    let triggerPattern = taskDescription;
    let confidenceThreshold = 0.8;
    let requiresApproval = true;

    if (fmMatch) {
        const lines = fmMatch[1].split('\n');
        for (const line of lines) {
            const [key, ...rest] = line.split(':');
            const val = rest.join(':').trim();
            if (key.trim() === 'skill_id') skillId = val;
            if (key.trim() === 'trigger_pattern') triggerPattern = val;
            if (key.trim() === 'confidence_threshold') confidenceThreshold = parseFloat(val);
            if (key.trim() === 'requires_approval') requiresApproval = val.toLowerCase() === 'true';
        }
    }

    // Generate embedding for the trigger pattern
    const embeddingResult = await generateEmbeddingWithMetadata(triggerPattern);
    
    // Save to Database
    const embeddingColumns = embeddingResult.dimension === 768
        ? { trigger_embedding_768: embeddingResult.vector }
        : { trigger_embedding_3072: embeddingResult.vector };

    const { error: dbError } = await supabase
        .from('relay_skills')
        .upsert({
            id: skillId,
            version: 1,
            trigger_pattern: triggerPattern,
            confidence_threshold: confidenceThreshold,
            requires_approval: requiresApproval,
            ...embeddingColumns
        });

    if (dbError) {
        console.error('[SkillExtractor] Failed to save skill to DB', dbError);
    }

    // Here we would ideally write the file to `lib/ucol/agents/prompts/skills/${skillId}.sudo.md` 
    // but in a production deployed environment, writing to local disk might be ephemeral.
    // For now we return it so the caller can handle storage if needed.

    return {
        passedGate: true,
        skillId,
        skillContent,
        triggerPattern,
        confidenceThreshold,
        requiresApproval
    };
}
