/**
 * Lattice OS shared core.
 *
 * Single source of truth for:
 *  - Environment and feature schemas (Zod)
 *  - License payload / key validation
 *  - Pre-flight and deploy contracts
 *  - Platform constants
 */

export * from './schemas/env.js';
export * from './schemas/license.js';
export * from './schemas/preflight.js';
export * from './schemas/deploy.js';
export * from './constants.js';
