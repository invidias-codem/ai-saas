module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__', '<rootDir>/lib'],
  // Only run actual test files. Helper-only modules live in __tests__ but aren't suites.
  testMatch: ['**/?(*.)+(spec|test).ts?(x)'],
  // Default node_modules ignore (no ESM transform exceptions — ESM-only packages
  // are name-mapped to CJS stubs below instead).
  transformIgnorePatterns: ['/node_modules/'],
  moduleNameMapper: {
    // Manual mock for the ESM-only workspace package (see __mocks__/@lattice-os/core.ts)
    '^@lattice-os/core$': '<rootDir>/__mocks__/@lattice-os/core.ts',
    // uuid@14 is ESM-only; map to the existing CJS stub (__mocks__/uuid.js)
    '^uuid$': '<rootDir>/__mocks__/uuid.js',
    // @noble/ed25519@2.3.0 is ESM-only; map to a CJS stub (__mocks__/@noble-ed25519.js)
    '^@noble/ed25519$': '<rootDir>/__mocks__/@noble-ed25519.js',
    // Manual mock for langfuse (langfuse-core does a top-level dynamic import()
    // that crashes Jest's VM). See __mocks__/langfuse.js.
    '^langfuse$': '<rootDir>/__mocks__/langfuse.js',
    '^@/(.*)$': '<rootDir>/$1',
    '^../../public/(.*)\\.json$': '<rootDir>/public/$1.json',
  },
};
