import { z } from 'zod';

export const localCliEnvSchema = z.object({
  LATTICE_API_URL: z.string().url().optional().default('http://localhost:3000'),
  LATTICE_USER_ID: z.string().min(1, 'LATTICE_USER_ID is required'),
  LATTICE_TOKEN: z.string().optional().or(z.literal('')).default(''),
  LATTICE_CLI_TOKEN: z.string().optional().or(z.literal('')).default(''),
});

export type LocalCliEnv = z.infer<typeof localCliEnvSchema>;

let cached: LocalCliEnv | null = null;
export function getLocalCliEnv(): LocalCliEnv {
  if (cached) return cached;
  cached = localCliEnvSchema.parse({
    LATTICE_API_URL: process.env.LATTICE_API_URL,
    LATTICE_USER_ID: process.env.LATTICE_USER_ID,
    LATTICE_TOKEN: process.env.LATTICE_TOKEN,
    LATTICE_CLI_TOKEN: process.env.LATTICE_CLI_TOKEN,
  });
  return cached;
}
