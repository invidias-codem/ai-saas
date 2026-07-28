import { z } from 'zod';

export const LatticeCliEnvSchema = z.object({
  LATTICE_CLI_TOKEN: z
    .string()
    .min(32, 'LATTICE_CLI_TOKEN must be at least 32 characters')
    .regex(/^[A-Za-z0-9]+$/, 'LATTICE_CLI_TOKEN must be alphanumeric'),
});

export type LatticeCliEnv = z.infer<typeof LatticeCliEnvSchema>;

export function parseLatticeCliEnv(env: Record<string, string | undefined>): LatticeCliEnv {
  return LatticeCliEnvSchema.parse(env);
}
