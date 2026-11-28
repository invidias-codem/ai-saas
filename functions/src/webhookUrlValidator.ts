// Functions deployment-local copy of the webhook allowlist validator.
// Keep behavior in sync with lib/security/urlValidator.ts.
import { URL } from 'url';

const WEBHOOK_DOMAINS = [
  'hooks.slack.com',
  'hooks.zapier.com',
];

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

