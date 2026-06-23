import { z } from "zod";
import { envSchema, type Env } from '@lattice-os/core';

const parsed = envSchema.parse(process.env);

export const env = parsed;

/**
 * Require a specific env var at runtime.
 *
 * Useful when envSchema allows optional keys (to support offline scripts),
 * but application code needs a hard requirement.
 */
export function requireEnv<K extends keyof Env>(key: K): NonNullable<Env[K]> {
  const value = env[key];
  if (value == null || (typeof value === 'string' && value.length === 0)) {
    throw new Error(`${String(key)} is required`);
  }
  return value as NonNullable<Env[K]>;
}
