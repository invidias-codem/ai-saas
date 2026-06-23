/**
 * Deploy / runtime configuration schema.
 */
import { z } from 'zod';

export const deployProfileSchema = z.object({
  name: z.string().min(1),
  tier: z.string().min(1).optional(),
  instance_id: z.string().optional(),
  ports: z.object({
    app: z.number().int().positive().default(3000),
    postgres: z.number().int().positive().default(5432),
    redis: z.number().int().positive().default(6379),
  }),
  resources: z
    .object({
      minRamGb: z.number().positive().default(4),
      minCpus: z.number().int().positive().default(2),
      minDiskGb: z.number().positive().default(8),
    })
    .optional(),
});

export type DeployProfile = z.infer<typeof deployProfileSchema>;
