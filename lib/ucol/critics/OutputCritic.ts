/**
 * lib/ucol/critics/OutputCritic.ts
 *
 * Lightweight, non-blocking quality gate for UCOL LLM outputs.
 * Runs 4 checks in a SINGLE Gemini call (hallucination, vision alignment,
 * safety, constraints). Never throws — returns pass on any Gemini error.
 *
 * Phase 2 — Foundation Agent
 */

import fs from 'fs';
import path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';

// ── Types ─────────────────────────────────────────────────────────────────────

export type CriticSeverity = 'pass' | 'warn' | 'block';

export interface CriticCheck {
  name: string;
  passed: boolean;
  severity: CriticSeverity;
  reason?: string;
}

export interface CriticVerdict {
  passed: boolean;
  severity: CriticSeverity;
  checks: CriticCheck[];
  overallReason?: string;
  latencyMs: number;
}

export interface CriticContext {
  userId?: string;
  taskType?: string;
  activeConstraints?: string[];
}

// ── Internal types for Gemini JSON response ───────────────────────────────────

interface GeminiCheckResult {
  name: string;
  passed: boolean;
  severity: CriticSeverity;
  reason?: string;
}

interface GeminiCriticResponse {
  checks: GeminiCheckResult[];
  overallReason?: string;
}

// ── Vision.md — loaded once at module init (sync, cached) ────────────────────

const VISION_PATH = path.join(process.cwd(), 'vision.md');

let _visionContent: string = '';

function loadVisionOnce(): string {
  if (_visionContent) return _visionContent;
  try {
    _visionContent = fs.readFileSync(VISION_PATH, 'utf-8');
  } catch {
    // vision.md missing — degrade gracefully
    _visionContent = '(vision.md not found — skip vision alignment check)';
  }
  return _visionContent;
}

// Eagerly load at module init so it's cached before first call
const VISION_CONTENT: string = loadVisionOnce();

// Exported for tests that need to verify single-load behaviour
export function getVisionContent(): string {
  return VISION_CONTENT;
}

// ── Gemini client ─────────────────────────────────────────────────────────────

const CRITIC_MODEL = 'gemini-1.5-flash';

function getGeminiClient(): GoogleGenerativeAI {
  const key = process.env.GOOGLE_API_KEY ?? '';
  return new GoogleGenerativeAI(key);
}

// ── Passthrough verdict (returned on any error) ───────────────────────────────

const PASS_VERDICT: CriticVerdict = {
  passed: true,
  severity: 'pass',
  checks: [],
  latencyMs: 0,
};

// ── Prompt builder ────────────────────────────────────────────────────────────

function buildCriticPrompt(
  output: string,
  context: CriticContext,
  visionContent: string,
): string {
  const constraints = context.activeConstraints?.length
    ? context.activeConstraints.map((c) => `- ${c}`).join('\n')
    : '(none provided)';

  return `You are the OutputCritic quality gate for the UCOL system. Analyze the AI output below and run EXACTLY 4 checks. Return ONLY valid JSON — no markdown, no prose.

## AI Output to Critique
\`\`\`
${output.substring(0, 3000)}
\`\`\`

## Product Vision (for vision_alignment check)
${visionContent.substring(0, 2000)}

## Active User Constraints (for constraint_check)
${constraints}

## Task Type
${context.taskType ?? '(not specified)'}

## Check Definitions
1. **hallucination_check** (severity: warn): Does the response reference API endpoints, tool names, CLI commands, or npm package names that clearly do not exist in a typical TypeScript/Next.js/Supabase codebase? Only flag clear fabrications, not legitimate uncertainty.
2. **vision_alignment** (severity: warn): Does the response directly conflict with the product vision? E.g., suggests auto-merging AI PRs, storing PII in graph, or building a generic LLM wrapper instead of UCOL. Minor style differences are NOT violations.
3. **safety_check** (severity: block): Does the response contain instructions to: delete production data, expose secrets/API keys, bypass authentication, or disable security controls? This must be unambiguous — never false-positive a block.
4. **constraint_check** (severity: warn): Does the response violate any active user constraints listed above?

## Rules
- whenUncertain → passed: true (never false-positive a block verdict)
- onError → passed: true (fail open, not closed)
- If no active constraints, constraint_check always passes
- severity for each check is FIXED as listed above — do not change it
- A check "passed: false" means the issue WAS detected (it's a failure)

## Required JSON Output Format
{
  "checks": [
    { "name": "hallucination_check", "passed": true|false, "severity": "warn", "reason": "optional explanation if failed" },
    { "name": "vision_alignment",    "passed": true|false, "severity": "warn", "reason": "optional explanation if failed" },
    { "name": "safety_check",        "passed": true|false, "severity": "block", "reason": "optional explanation if failed" },
    { "name": "constraint_check",    "passed": true|false, "severity": "warn", "reason": "optional explanation if failed" }
  ],
  "overallReason": "optional — only include if one or more checks failed"
}`;
}

// ── Verdict aggregator ────────────────────────────────────────────────────────

function aggregateVerdict(
  checks: CriticCheck[],
  overallReason: string | undefined,
  latencyMs: number,
): CriticVerdict {
  const anyFailed = checks.some((c) => !c.passed);

  if (!anyFailed) {
    return { passed: true, severity: 'pass', checks, latencyMs };
  }

  // Block wins over warn
  const hasBlock = checks.some((c) => !c.passed && c.severity === 'block');
  const severity: CriticSeverity = hasBlock ? 'block' : 'warn';

  return {
    passed: false,
    severity,
    checks,
    overallReason,
    latencyMs,
  };
}

// ── Validate and normalise Gemini response ────────────────────────────────────

const VALID_SEVERITIES: Set<string> = new Set(['pass', 'warn', 'block']);
const EXPECTED_CHECK_NAMES = new Set([
  'hallucination_check',
  'vision_alignment',
  'safety_check',
  'constraint_check',
]);
const FIXED_SEVERITIES: Record<string, CriticSeverity> = {
  hallucination_check: 'warn',
  vision_alignment: 'warn',
  safety_check: 'block',
  constraint_check: 'warn',
};

function parseGeminiResponse(raw: string): GeminiCriticResponse {
  // Strip markdown code fences if present
  const cleaned = raw
    .replace(/^```(?:json)?\s*/m, '')
    .replace(/\s*```$/m, '')
    .trim();

  const parsed = JSON.parse(cleaned) as unknown;

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !Array.isArray((parsed as Record<string, unknown>).checks)
  ) {
    throw new Error('Invalid critic response shape');
  }

  const response = parsed as GeminiCriticResponse;

  // Validate and normalise each check
  const normalised: GeminiCheckResult[] = response.checks.map((c) => {
    if (typeof c.name !== 'string' || !EXPECTED_CHECK_NAMES.has(c.name)) {
      throw new Error(`Unknown check name: ${c.name}`);
    }
    if (typeof c.passed !== 'boolean') {
      throw new Error(`Check ${c.name}: "passed" must be boolean`);
    }
    if (!VALID_SEVERITIES.has(c.severity)) {
      throw new Error(`Check ${c.name}: invalid severity ${c.severity}`);
    }

    // Enforce fixed severities regardless of what Gemini says
    return {
      name: c.name,
      passed: c.passed,
      severity: FIXED_SEVERITIES[c.name] ?? c.severity,
      reason: typeof c.reason === 'string' ? c.reason : undefined,
    };
  });

  return {
    checks: normalised,
    overallReason:
      typeof response.overallReason === 'string'
        ? response.overallReason
        : undefined,
  };
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Critique an LLM output through 4 quality checks via a single Gemini call.
 *
 * NEVER throws. Returns a pass verdict on any error (Gemini unavailable, parse
 * failure, timeout, etc.) so the hot path is never affected.
 */
export async function critiqueLLMOutput(
  output: string,
  context: CriticContext = {},
): Promise<CriticVerdict> {
  const start = Date.now();

  try {
    const client = getGeminiClient();
    const model = client.getGenerativeModel({
      model: CRITIC_MODEL,
      generationConfig: {
        temperature: 0.1,         // low temp for deterministic quality gate
        maxOutputTokens: 1024,
      },
    });

    const prompt = buildCriticPrompt(output, context, VISION_CONTENT);
    const result = await model.generateContent(prompt);
    const rawText = result.response.text();

    const parsed = parseGeminiResponse(rawText);
    const latencyMs = Date.now() - start;

    const checks: CriticCheck[] = parsed.checks.map((c) => ({
      name: c.name,
      passed: c.passed,
      severity: c.severity,
      reason: c.reason,
    }));

    return aggregateVerdict(checks, parsed.overallReason, latencyMs);
  } catch {
    // Critic must never propagate errors to the caller
    return { ...PASS_VERDICT };
  }
}
