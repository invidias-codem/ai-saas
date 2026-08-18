import { env } from "@/lib/env";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogMeta {
  [key: string]: unknown;
}

export function log(
  level: LogLevel,
  message: string,
  meta: unknown = {}
) {
  const metaObj = typeof meta === 'object' && meta !== null ? (meta as Record<string, unknown>) : { message: String(meta) };
  const entry = {
    level,
    message: sanitizeLogValue(message),
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development',
    ...Object.fromEntries(
      Object.entries(metaObj).map(([k, v]) => [k, sanitizeLogValue(v, 500)])
    ),
  };

  const json = JSON.stringify(entry);
   
  console[level === 'debug' ? 'log' : level](json);
}

/**
 * Strip control characters that could forge new log lines or inject
 * formatting. Use on any value that originates from user input before
 * it reaches a log sink.
 */
export function sanitizeLogValue(value: unknown, maxLength = 200): string {
  return String(value ?? '')
    .replace(/[\r\n\t]/g, ' ')
    .replace(/\x1b\[[0-9;]*m/g, '')
    .replace(/[\x00-\x1f\x7f]/g, '')
    .slice(0, maxLength);
}

export const logger = {
  debug: (message: string, meta?: unknown) => log('debug', message, meta),
  info: (message: string, meta?: unknown) => log('info', message, meta),
  warn: (message: string, meta?: unknown) => log('warn', message, meta),
  error: (message: string, meta?: unknown) => log('error', message, meta),
};
