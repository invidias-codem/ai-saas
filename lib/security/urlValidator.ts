/**
 * urlValidator.ts — SSRF protection utility
 * Validates URLs before making outbound HTTP requests.
 *
 * Three validation modes:
 *  - validateExternalUrl()  : General URLs (link unfurling). Blocks private IPs + non-http(s).
 *  - validateSlackFileUrl() : Slack CDN file downloads only.
 *  - validateWebhookUrl()   : Slack/Zapier response_url / webhook callbacks only.
 */

import { URL } from 'url';
import dns from 'dns/promises';
import net from 'net';

// ── Private IP ranges (SSRF blocklist) ───────────────────────────────────────
const PRIVATE_RANGES = [
  /^127\./,                        // loopback
  /^10\./,                         // RFC 1918
  /^172\.(1[6-9]|2\d|3[01])\./,   // RFC 1918
  /^192\.168\./,                   // RFC 1918
  /^169\.254\./,                   // link-local (AWS metadata!)
  /^::1$/,                          // IPv6 loopback
  /^fc00:/,                         // IPv6 unique local
  /^fe80:/,                         // IPv6 link-local
  /^0\.0\.0\.0$/,
  /^localhost$/i,
  /\.internal$/i,
  /\.local$/i,
];

function isPrivateIp(ip: string): boolean {
  return PRIVATE_RANGES.some(r => r.test(ip));
}

/**
 * Resolves hostname and checks resolved IPs aren't private.
 * Prevents DNS rebinding attacks.
 */
async function isHostSafe(hostname: string): Promise<boolean> {
  try {
    // Block raw private IPs
    if (net.isIP(hostname) && isPrivateIp(hostname)) return false;

    // Resolve and check all A/AAAA records
    const addrs = await dns.lookup(hostname, { all: true });
    for (const { address } of addrs) {
      if (isPrivateIp(address)) return false;
    }
    return true;
  } catch {
    return false; // DNS failure = block
  }
}

// ── Allowlists ────────────────────────────────────────────────────────────────
const SLACK_FILE_DOMAINS = [
  'files.slack.com',
  'cdn.slack-edge.com',
  'slack-imgs.com',
  'a.slack-edge.com',
];

const WEBHOOK_DOMAINS = [
  'hooks.slack.com',
  'hooks.zapier.com',
];

// ── Validators ────────────────────────────────────────────────────────────────

/**
 * For general link unfurling / external content fetching.
 * Allows any public HTTP(S) URL but blocks private network ranges.
 */
export async function validateExternalUrl(rawUrl: string): Promise<{ valid: boolean; reason?: string }> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { valid: false, reason: 'Invalid URL format' };
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return { valid: false, reason: `Disallowed protocol: ${parsed.protocol}` };
  }

  const safe = await isHostSafe(parsed.hostname);
  if (!safe) {
    return { valid: false, reason: `Blocked: private/internal host ${parsed.hostname}` };
  }

  return { valid: true };
}

/**
 * For Slack file downloads. Strict domain allowlist.
 */
export function validateSlackFileUrl(rawUrl: string): { valid: boolean; reason?: string } {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { valid: false, reason: 'Invalid URL format' };
  }

  if (parsed.protocol !== 'https:') {
    return { valid: false, reason: 'Slack files must use HTTPS' };
  }

  const allowed = SLACK_FILE_DOMAINS.some(d => parsed.hostname === d || parsed.hostname.endsWith('.' + d));
  if (!allowed) {
    return { valid: false, reason: `Untrusted Slack file domain: ${parsed.hostname}` };
  }

  return { valid: true };
}

/**
 * For Slack response_url and Zapier webhook callbacks.
 * Strict HTTPS + domain allowlist.
 */
export function validateWebhookUrl(rawUrl: string): { valid: boolean; reason?: string } {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { valid: false, reason: 'Invalid URL format' };
  }

  if (parsed.protocol !== 'https:') {
    return { valid: false, reason: 'Webhook URL must use HTTPS' };
  }

  const allowed = WEBHOOK_DOMAINS.some(d => parsed.hostname === d || parsed.hostname.endsWith('.' + d));
  if (!allowed) {
    return { valid: false, reason: `Untrusted webhook domain: ${parsed.hostname}. Allowed: ${WEBHOOK_DOMAINS.join(', ')}` };
  }

  return { valid: true };
}

/**
 * Sanitizes user-controlled strings before interpolation into log messages.
 * Prevents log injection via newline/ANSI escape sequences.
 */
export function sanitizeForLog(value: unknown, maxLength = 200): string {
  return String(value ?? '')
    .replace(/[\r\n\t]/g, ' ')          // strip newlines (log injection)
    .replace(/\x1b\[[0-9;]*m/g, '')      // strip ANSI color codes
    .replace(/[\x00-\x1f\x7f]/g, '')    // strip other control chars
    .slice(0, maxLength);
}
