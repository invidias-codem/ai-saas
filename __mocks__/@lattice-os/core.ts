/**
 * Jest manual mock for `@lattice-os/core`.
 *
 * Why this exists:
 * The `@lattice-os/core` workspace package is ESM-only (`"type": "module"`,
 * `exports` map with import-only conditions). Under the Node/Jest CJS test
 * runner, `require('@lattice-os/core')` cannot resolve the ESM `import`
 * condition, so any test that transitively imports `lib/env.ts` fails at
 * module-load time with `Cannot find module '@lattice-os/core'`.
 *
 * This mock reproduces ONLY the surface the test environment relies on:
 * `envSchema` (a permissive Zod object that accepts process.env),
 * `Env` type re-export, and the helpers `lib/env.ts` re-exports.
 * It keeps the security/route tests green without forcing the whole workspace
 * build into the Jest resolver.
 */

import { z } from 'zod';

// The real envSchema is a strict Zod object; for tests we accept a
// permissive passthrough so required-but-unset env vars don't crash the
// module load. The individual routes still validate their own bodies.
export const envSchema = z.object({
  NODE_ENV: z.string().optional().default('test'),
}).passthrough();

export type Env = z.infer<typeof envSchema>;
