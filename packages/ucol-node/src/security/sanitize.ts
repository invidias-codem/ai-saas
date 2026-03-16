/**
 * @file security/sanitize.ts
 * @description Content sanitization for H (History) items before indexing.
 *
 * Per spec §7.3: History items may contain user-controlled content with
 * potential prompt injection payloads. Sanitize before indexing.
 */

import type { HistoryItem } from '../store/schema.js';

/** Sanitization result */
export interface SanitizeResult {
  content: string;
  was_modified: boolean;
  threats_detected: string[];
}

/**
 * Patterns that indicate potential prompt injection attempts.
 * These are heuristic patterns — not exhaustive.
 */
const INJECTION_PATTERNS: Array<{ pattern: RegExp; name: string }> = [
  {
    pattern: /ignore\s+(?:all\s+)?(?:previous|prior|above)\s+instructions?/gi,
    name: 'instruction_override',
  },
  {
    pattern: /you\s+(?:are|must|should)\s+(?:now\s+)?(?:act|behave|pretend|play)/gi,
    name: 'role_override',
  },
  {
    pattern: /system\s*:\s*(?:you|your|the)/gi,
    name: 'fake_system_prompt',
  },
  {
    pattern: /<\s*system\s*>[\s\S]*?<\s*\/\s*system\s*>/gi,
    name: 'xml_system_injection',
  },
  {
    pattern: /\[\s*INST\s*\][\s\S]*?\[\s*\/\s*INST\s*\]/gi,
    name: 'llama_instruction_injection',
  },
  {
    pattern: /###\s+(?:instruction|system|human|assistant)\s*:/gi,
    name: 'markdown_prompt_injection',
  },
  {
    pattern: /jailbreak|DAN\s+mode|developer\s+mode|god\s+mode/gi,
    name: 'jailbreak_attempt',
  },
  {
    pattern: /reveal\s+(?:your\s+)?(?:system\s+prompt|instructions?|training)/gi,
    name: 'system_prompt_extraction',
  },
  {
    pattern: /\beval\s*\(/gi,
    name: 'code_injection_eval',
  },
  {
    pattern: /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
    name: 'script_injection',
  },
];

/** PII patterns to redact */
const PII_PATTERNS: Array<{ pattern: RegExp; replacement: string; name: string }> = [
  {
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    replacement: '[EMAIL_REDACTED]',
    name: 'email',
  },
  {
    // US SSN
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
    replacement: '[SSN_REDACTED]',
    name: 'ssn',
  },
  {
    // Credit card numbers (Luhn-ish pattern)
    pattern: /\b(?:\d[ -]?){15,16}\b/g,
    replacement: '[CARD_REDACTED]',
    name: 'credit_card',
  },
];

/**
 * Sanitize a History Item's content before indexing.
 *
 * Removes/flags:
 * 1. Prompt injection patterns (instruction overrides, role changes)
 * 2. Fake system prompts (XML/markdown injection)
 * 3. Code injection patterns
 * 4. PII (email, SSN, credit cards) when pii_redact=true
 *
 * @param item - HistoryItem to sanitize
 * @param options - Sanitization options
 * @returns Sanitized result with modified content and threat list
 */
export function sanitizeHistoryItem(
  item: HistoryItem,
  options: { pii_redact?: boolean; strict?: boolean } = {}
): SanitizeResult {
  const { pii_redact = false, strict = false } = options;
  const threats: string[] = [];
  let content = item.content;
  let wasModified = false;

  // Only sanitize USER and TOOL content (AGENT/SYSTEM are trusted)
  if (item.role !== 'USER' && item.role !== 'TOOL') {
    return { content, was_modified: false, threats_detected: [] };
  }

  // Check for injection patterns
  for (const { pattern, name } of INJECTION_PATTERNS) {
    if (pattern.test(content)) {
      threats.push(name);
      if (strict) {
        // In strict mode, remove the pattern entirely
        content = content.replace(pattern, `[INJECTION_REMOVED:${name}]`);
        wasModified = true;
      }
      // Reset lastIndex for global patterns
      pattern.lastIndex = 0;
    }
  }

  // Redact PII if requested
  if (pii_redact) {
    for (const { pattern, replacement, name } of PII_PATTERNS) {
      if (pattern.test(content)) {
        threats.push(`pii_${name}`);
        content = content.replace(pattern, replacement);
        wasModified = true;
        pattern.lastIndex = 0;
      }
    }
  }

  // Normalize whitespace (prevent homoglyph attacks)
  const normalizedContent = content.normalize('NFKC');
  if (normalizedContent !== content) {
    content = normalizedContent;
    wasModified = true;
    threats.push('unicode_normalization');
  }

  // Truncate to spec maximum (128KB per spec §A.4)
  const MAX_BYTES = 131072;
  const buf = Buffer.from(content, 'utf8');
  if (buf.length > MAX_BYTES) {
    content = buf.slice(0, MAX_BYTES).toString('utf8');
    wasModified = true;
    threats.push('content_truncated');
  }

  return {
    content,
    was_modified: wasModified,
    threats_detected: threats,
  };
}

/**
 * Batch-sanitize a list of HistoryItems.
 *
 * @param items - Array of HistoryItems
 * @param options - Sanitization options
 * @returns Array of sanitized items (original items are not mutated)
 */
export function sanitizeHistory(
  items: HistoryItem[],
  options: { pii_redact?: boolean; strict?: boolean } = {}
): HistoryItem[] {
  return items.map((item) => {
    const result = sanitizeHistoryItem(item, options);
    if (!result.was_modified) return item;
    return { ...item, content: result.content };
  });
}

/**
 * Check if content contains potential injection patterns without modifying it.
 *
 * @param content - String to check
 * @returns Array of detected threat names (empty if clean)
 */
export function detectThreats(content: string): string[] {
  const threats: string[] = [];
  for (const { pattern, name } of INJECTION_PATTERNS) {
    if (pattern.test(content)) {
      threats.push(name);
    }
    pattern.lastIndex = 0;
  }
  return threats;
}
