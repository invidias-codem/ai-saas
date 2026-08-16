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
    message,
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development',
    ...metaObj,
  };

  const json = JSON.stringify(entry);
   
  console[level === 'debug' ? 'log' : level](json);
}

export const logger = {
  debug: (message: string, meta?: unknown) => log('debug', message, meta),
  info: (message: string, meta?: unknown) => log('info', message, meta),
  warn: (message: string, meta?: unknown) => log('warn', message, meta),
  error: (message: string, meta?: unknown) => log('error', message, meta),
};
