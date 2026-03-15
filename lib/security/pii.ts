const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

// MVP phone matcher (intentionally broad)
const PHONE_RE =
  /(?<![0-9A-Za-z_])(\+?\d{1,3}[\s.-]?)?(\(?\d{2,3}\)?[\s.-]?)?\d{3}[\s.-]?\d{4}(?![0-9A-Za-z_])/g;

// High-confidence secret hints
const SECRET_HINT_RE =
  /\b(AIza[0-9A-Za-z_-]{20,}|sk-[0-9A-Za-z_-]{20,}|sb_secret_[0-9A-Za-z_-]{20,}|Bearer\s+[0-9A-Za-z._-]{20,})\b/g;

// Generic long token heuristic (can be noisy; keep last to avoid over-redaction)
const LONG_TOKEN_RE = /\b[0-9A-Za-z+/_-]{32,}\b/g;

/**
 * Scrub common PII and secrets from text.
 *
 * NOTE: This is an MVP scrubber intended to catch high-confidence patterns.
 * It should be extended over time as new patterns are observed.
 */
export function scrubText(s: string): string {
  return s
    .replace(EMAIL_RE, "[REDACTED_EMAIL]")
    .replace(PHONE_RE, "[REDACTED_PHONE]")
    .replace(SECRET_HINT_RE, "[REDACTED_SECRET]")
    .replace(LONG_TOKEN_RE, "[REDACTED_SECRET]");
}

/**
 * Recursively scrub strings in an arbitrary JSON-like value.
 */
export function scrubObject(value: unknown): unknown {
  if (typeof value === "string") return scrubText(value);
  if (Array.isArray(value)) return value.map(scrubObject);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = scrubObject(v);
    return out;
  }
  return value;
}
