/**
 * @file router/classify.ts
 * @description Gemini Flash intent classifier for UCOL task routing.
 *
 * Classifies a task query into a TaskIntent enum value.
 * Uses Gemini Flash with a 200ms timeout; falls back to UNKNOWN on timeout/error.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import type { TaskIntent } from '../store/schema.js';

/** All valid intent values */
const VALID_INTENTS: TaskIntent[] = [
  'QUICK_ANSWER',
  'CODE_GENERATION',
  'RESEARCH',
  'STRATEGY',
  'ORCHESTRATION',
  'QUALITY_ANALYSIS',
  'DB_QUERY',
  'DEPLOYMENT',
  'REPO_MANAGEMENT',
  'MEMORY_EXTRACT',
  'UNKNOWN',
];

/** Classification result from Gemini Flash */
export interface ClassificationResult {
  intent: TaskIntent;
  confidence: number;
  source: 'gemini' | 'fallback';
}

/**
 * Classify a task query using Gemini Flash.
 *
 * @param query - Natural language task description
 * @param geminiApiKey - Google Gemini API key
 * @param timeoutMs - Maximum wait time in milliseconds (default: 200)
 * @returns ClassificationResult with intent and confidence
 */
export async function classifyIntent(
  query: string,
  geminiApiKey: string,
  timeoutMs: number = 200
): Promise<ClassificationResult> {
  const timeoutPromise = new Promise<ClassificationResult>((resolve) =>
    setTimeout(
      () => resolve({ intent: 'UNKNOWN', confidence: 0.0, source: 'fallback' }),
      timeoutMs
    )
  );

  const classifyPromise = doClassify(query, geminiApiKey);

  return Promise.race([classifyPromise, timeoutPromise]);
}

/** Perform the actual Gemini Flash classification */
async function doClassify(
  query: string,
  geminiApiKey: string
): Promise<ClassificationResult> {
  try {
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = buildClassificationPrompt(query);
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    return parseClassificationResponse(text);
  } catch {
    return { intent: 'UNKNOWN', confidence: 0.0, source: 'fallback' };
  }
}

/** Build the classification prompt */
function buildClassificationPrompt(query: string): string {
  return `You are a task intent classifier for an AI routing system.
Classify the following task into exactly one of these intents:
QUICK_ANSWER, CODE_GENERATION, RESEARCH, STRATEGY, ORCHESTRATION,
QUALITY_ANALYSIS, DB_QUERY, DEPLOYMENT, REPO_MANAGEMENT, MEMORY_EXTRACT, UNKNOWN

Task: "${query}"

Respond with ONLY a JSON object in this exact format:
{"intent": "INTENT_VALUE", "confidence": 0.0}

where confidence is a float between 0.0 and 1.0.`;
}

/** Parse the Gemini response into a ClassificationResult */
function parseClassificationResponse(text: string): ClassificationResult {
  try {
    // Extract JSON from the response (handle markdown code blocks)
    const jsonMatch = text.match(/\{[^}]+\}/);
    if (!jsonMatch) {
      return { intent: 'UNKNOWN', confidence: 0.0, source: 'fallback' };
    }

    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    const intent = parsed['intent'];
    const confidence = parsed['confidence'];

    if (
      typeof intent === 'string' &&
      (VALID_INTENTS as string[]).includes(intent) &&
      typeof confidence === 'number'
    ) {
      return {
        intent: intent as TaskIntent,
        confidence: Math.max(0.0, Math.min(1.0, confidence)),
        source: 'gemini',
      };
    }

    return { intent: 'UNKNOWN', confidence: 0.0, source: 'fallback' };
  } catch {
    return { intent: 'UNKNOWN', confidence: 0.0, source: 'fallback' };
  }
}

/**
 * Default routing table: TaskIntent → ModelID.
 * Maps each intent to the best-suited model.
 */
export const DEFAULT_ROUTING_TABLE: Record<TaskIntent, string> = {
  QUICK_ANSWER: 'google/gemini-flash-3.1',
  CODE_GENERATION: 'anthropic/claude-sonnet-4-6',
  RESEARCH: 'google/gemini-pro-1.5',
  STRATEGY: 'anthropic/claude-sonnet-4-6',
  ORCHESTRATION: 'anthropic/claude-sonnet-4-6',
  QUALITY_ANALYSIS: 'anthropic/claude-sonnet-4-6',
  DB_QUERY: 'deepseek/deepseek-coder',
  DEPLOYMENT: 'anthropic/claude-sonnet-4-6',
  REPO_MANAGEMENT: 'anthropic/claude-sonnet-4-6',
  MEMORY_EXTRACT: 'google/gemini-flash-3.1',
  UNKNOWN: 'google/gemini-flash-3.1',
};

/**
 * Score context items for confidence-based model upgrade.
 *
 * @param memoryFacts - Pre-fetched knowledge items
 * @returns Recommended model upgrade if confidence is high
 */
export function scoreContextConfidence(
  memoryFacts: Array<{ confidence: number }>,
  currentModel: string
): { tier: 'UPGRADE' | 'SAME'; recommended_model: string } {
  if (memoryFacts.length === 0) {
    return { tier: 'SAME', recommended_model: currentModel };
  }

  const avgConfidence =
    memoryFacts.reduce((acc, f) => acc + f.confidence, 0) / memoryFacts.length;

  // High-confidence facts suggest we can use a more capable model
  if (avgConfidence >= 0.8 && !currentModel.startsWith('anthropic/')) {
    return {
      tier: 'UPGRADE',
      recommended_model: 'anthropic/claude-sonnet-4-6',
    };
  }

  return { tier: 'SAME', recommended_model: currentModel };
}
