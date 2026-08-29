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

/**
 * Resolve the NVIDIA NIM base URL and API key at runtime.
 * The key is lazy-validated so modules that import this file do not throw
 * when NVIDIA NIM is not yet configured (e.g. offline scripts / eval harness).
 */
export function nvidiaNimConfig(): { apiKey: string; baseUrl: string } | null {
  if (!env.NVIDIA_API_KEY) return null;
  return {
    apiKey: env.NVIDIA_API_KEY,
    baseUrl: env.NVIDIA_NIM_BASE_URL ?? 'https://integrate.api.nvidia.com/v1',
  };
}
