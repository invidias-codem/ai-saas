const nextJest = require('next/jest')

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: './',
})

// Add any custom config to be passed to Jest
const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^uuid$': '<rootDir>/__mocks__/uuid.js',
    '^@lattice-os/core$': '<rootDir>/packages/lattice-core/dist/index.js',
    '^@lattice-os/core/(.*)$': '<rootDir>/packages/lattice-core/dist/$1',
  },
  testEnvironment: 'jest-environment-node',
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/__tests__/**/*.test.tsx',
    '!**/anycrawl/**',
  ],
  modulePathIgnorePatterns: [
    '<rootDir>/.next/',
    '<rootDir>/dist/',
    '<rootDir>/build/',
  ],
  testPathIgnorePatterns: [
    '<rootDir>/.next/',
    '<rootDir>/node_modules/',
  ],
  collectCoverageFrom: [
    'lib/**/*.{js,jsx,ts,tsx}',
    'app/api/**/*.{js,jsx,ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/.next/**',
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  testTimeout: 10000,
}

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async.
// We wrap it to inject a transformIgnorePatterns entry that allows @noble (pure-ESM deps) to be
// transformed by babel — next/jest's default .pnpm allowlist only permits geist/next.
module.exports = async () => {
  const config = await createJestConfig(customJestConfig)()
  // next/jest hard-codes a .pnpm allowlist (only geist|next). Drop it and
  // add our own that also permits pure-ESM deps (@noble) and uuid to be
  // transformed by babel. A path is transformed UNLESS it matches any
  // transformIgnorePatterns entry, so we must ensure @noble matches NONE.
  const base = (config.transformIgnorePatterns || []).filter(
    (p) => !String(p).includes('.pnpm')
  )
  config.transformIgnorePatterns = [
    ...base,
    '/node_modules/(?!(.*@noble|.*uuid|geist|next)/)',
  ]
  return config
}
