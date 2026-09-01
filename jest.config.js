module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__', '<rootDir>/lib'],
  // Treat helper-only modules as non-testable: they have no test cases by design.
  testPathIgnorePatterns: [
    '/node_modules/',
    '__tests__/slack/testHelpers.ts',
    '__tests__/utils/testHelpers.ts',
    '__tests__/support/cli/scenario.ts',
    '__tests__/support/cli/env.ts',
    '__tests__/support/providerKeys.ts',
    '__tests__/agents/adversarial/atlasCorpus.ts',
  ],
  moduleNameMapper: {
    // Manual mock for the ESM-only workspace package (see __mocks__/@lattice-os/core.ts)
    '^@lattice-os/core$': '<rootDir>/__mocks__/@lattice-os/core.ts',
    '^@/(.*)$': '<rootDir>/$1',
    '^../../public/(.*)\\.json$': '<rootDir>/public/$1.json',
  },
};
