import { timingSafeEqual } from 'node:crypto';

export function verifyTelegramWebhookSecret(expected: string | undefined, supplied: string | null):
  { ok: true } | { ok: false; status: 401 | 503 } {
  // Telegram secret_token permits 1–256 ASCII letters, digits, underscores and hyphens.
  if (!expected || !/^[A-Za-z0-9_-]{1,256}$/.test(expected)) return { ok: false, status: 503 };
  if (!supplied || !/^[A-Za-z0-9_-]{1,256}$/.test(supplied)) return { ok: false, status: 401 };
  const a = Buffer.from(expected), b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a,b) ? { ok: true } : { ok: false, status: 401 };
}

export function isTelegramPrivateAdmin(configured: string | undefined, chat: {id: number; type: string} | undefined, sender: {id: number; is_bot: boolean} | undefined): boolean {
  return Boolean(configured && chat?.type === 'private' && sender && !sender.is_bot &&
    Number.isSafeInteger(chat.id) && Number.isSafeInteger(sender.id) &&
    chat.id === sender.id && String(sender.id) === configured);
}
