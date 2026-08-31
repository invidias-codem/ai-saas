module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__', '<rootDir>/lib'],
  moduleNameMapper: {
    // Manual mock for the ESM-only workspace package (see __mocks__/@lattice-os/core.ts)
    '^@lattice-os/core$': '<rootDir>/__mocks__/@lattice-os/core.ts',
    '^@/(.*)$': '<rootDir>/$1',
    '^../../public/(.*)\\.json$': '<rootDir>/public/$1.json',
  },
};
