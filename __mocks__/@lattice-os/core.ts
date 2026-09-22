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
 * envSchema re-exports the REAL schema from source: the real schema has NO
 * required fields (every var is optional or defaulted), so parsing an empty
 * test env succeeds, and tests exercise the production constraints — e.g.
 * the JEV_MODEL pinned-version regex — instead of a permissive stub that
 * silently lets aliases through.
 *
 * Anything else the test environment needs from this package gets added
 * below on demand (helpers lib/env.ts re-exports, etc.).
 */

export { envSchema } from '../../packages/lattice-core/src/schemas/env';

export type Env = {
  NODE_ENV?: string;
  [key: string]: unknown;
};
