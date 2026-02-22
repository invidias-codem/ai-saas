/**
 * UCOL Error Resolution Agent — ErrorClassifier
 *
 * Uses Gemini to classify a raw Vercel log error into a known category,
 * extract suspected files, and summarize what went wrong.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { requireEnv } from '@/lib/env';
import type { ClassifiedError, ErrorCategory } from './types';

function getGemini() {
  return new GoogleGenerativeAI(requireEnv('GOOGLE_API_KEY'));
}

const CLASSIFICATION_PROMPT = `You are an expert Next.js/React production error analyst.

Analyze the following Vercel production error log and return a JSON object with this exact shape:
{
  "category": "<one of: undefined_component | missing_dependency | type_error | hydration_mismatch | api_error | env_missing | import_error | unknown>",
  "confidence": <0.0 to 1.0>,
  "summary": "<1-2 sentence plain English explanation of what went wrong>",
  "suspectedFiles": ["<relative file path>", ...],
  "stackFrames": ["<relevant stack frame string>", ...]
}

Category definitions:
- undefined_component: React error "Element type is invalid... got: undefined" — usually a bad/mismatched import
- missing_dependency: "Cannot find module" or "Module not found" — package not installed or wrong import path
- type_error: JavaScript TypeError at runtime (null/undefined property access, etc.)
- hydration_mismatch: "Text content did not match" or "Hydration failed" — SSR/CSR mismatch
- api_error: Unhandled exception in an API route handler
- env_missing: Missing or undefined environment variable
- import_error: ESM/CJS interop issue, circular dependency, wrong export type
- unknown: Cannot determine cause from log alone

Rules:
- suspectedFiles must be relative paths (e.g. "app/dashboard/page.tsx") — extract from stack traces
- Return ONLY the JSON object, no markdown fences, no explanation

Error log:
`;

export async function classifyError(
  logId: string,
  rawMessage: string,
  timestamp: string
): Promise<ClassifiedError> {
  const model = getGemini().getGenerativeModel({ model: 'gemini-1.5-flash' });

  let parsed: any;
  try {
    const result = await model.generateContent(CLASSIFICATION_PROMPT + rawMessage);
    const text = result.response.text().trim();

    // Strip markdown fences if Gemini wraps despite instructions
    const clean = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    parsed = JSON.parse(clean);
  } catch (err: any) {
    console.error('[ErrorClassifier] Gemini parse failed:', err.message);
    // Fallback: mark as unknown so the human-escalation path handles it
    parsed = {
      category: 'unknown',
      confidence: 0,
      summary: 'Classifier failed to parse error. Manual review required.',
      suspectedFiles: [],
      stackFrames: [],
    };
  }

  return {
    logId,
    rawMessage,
    timestamp,
    category: (parsed.category ?? 'unknown') as ErrorCategory,
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
    summary: parsed.summary ?? rawMessage.slice(0, 200),
    suspectedFiles: Array.isArray(parsed.suspectedFiles) ? parsed.suspectedFiles : [],
    stackFrames: Array.isArray(parsed.stackFrames) ? parsed.stackFrames : [],
  };
}
