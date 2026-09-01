module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__', '<rootDir>/lib'],
  // Only run actual test files. Helper-only modules live in __tests__ but aren't suites.
  testMatch: ['**/?(*.)+(spec|test).ts?(x)'],
  // Transform ESM packages that ship as ES modules
  transformIgnorePatterns: [
    'node_modules/(?!\\.pnpm/(uuid|langfuse|@noble/ed25519)|(?:uuid|langfuse|@noble/ed25519))',
  ],
  moduleNameMapper: {
    // Manual mock for the ESM-only workspace package (see __mocks__/@lattice-os/core.ts)
    '^@lattice-os/core$': '<rootDir>/__mocks__/@lattice-os/core.ts',
    '^@/(.*)$': '<rootDir>/$1',
    '^../../public/(.*)\\.json$': '<rootDir>/public/$1.json',
  },
};
