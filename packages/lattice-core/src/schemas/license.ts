/**
 * License payload and key contract.
 *
 * Mirrors the V3 ed25519 license format implemented in the Python CLI,
 * but provides a TS-native Zod schema so MCP/remote adapters can validate
 * calls without depending on the Python runtime.
 */
import { z } from 'zod';

export const licenseTierSchema = z.enum(['community', 'enterprise']);
export type LicenseTier = z.infer<typeof licenseTierSchema>;

export const licenseFeaturesSchema = z.array(z.string()).default([]);

export const licensePayloadSchema = z.object({
  tier: licenseTierSchema,
  features: licenseFeaturesSchema,
  instance_id: z.string().default('default').optional(),
  issued_at: z.string().datetime().optional(),
  expires_at: z.string().datetime().optional(),
});

export type LicensePayload = z.infer<typeof licensePayloadSchema>;

export const licenseKeySchema = z
  .string()
  .regex(/^lattice-v3-[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, {
    message: 'Invalid Lattice V3 license key format',
  });

export type LicenseKey = z.infer<typeof licenseKeySchema>;
