/**
 * Base Jest Configuration - For all packages in AnyCrawl monorepo
 * 
 * This configuration solves the following issues:
 * 1. ESM module support
 * 2. Workspace package resolution
 * 3. Correct ts-jest configuration
 */

const baseConfig = {
    preset: "ts-jest/presets/default-esm",
    testEnvironment: "node",

    // ESM support
    extensionsToTreatAsEsm: [".ts"],

    // Module name mapper: Handle .js extension imports
    moduleNameMapper: {
        "^(\\.{1,2}/.*)\\.js$": "$1",
    },

    // Transform configuration
    transform: {
        "^.+\\.tsx?$": [
            "ts-jest",
            {
                useESM: true,
                // Important: Use transpilation: true to avoid NodeNext warnings
                transpilation: true,
                tsconfig: {
                    module: "NodeNext",
                    moduleResolution: "NodeNext",
                    target: "ES2022",
                    esModuleInterop: true,
                    allowSyntheticDefaultImports: true,
                },
            },
        ],
    },

    // Important: Don't ignore workspace packages and certain node_modules that need transformation
    transformIgnorePatterns: [
        // Exclude most node_modules, but keep packages that need transformation
        "node_modules/(?!(@anycrawl|@tootallnate|drizzle-orm|crawlee|@crawlee|@apify)/)",
    ],

    // Test match patterns
    testMatch: ["**/__tests__/**/*.test.ts"],

    // Verbose output
    verbose: true,

    // Handle symlinks (pnpm workspace)
    modulePathIgnorePatterns: [],
    watchPathIgnorePatterns: [],

    // Coverage configuration
    collectCoverageFrom: [
        "src/**/*.{ts,tsx}",
        "!src/**/*.d.ts",
        "!src/**/*.test.{ts,tsx}",
        "!src/**/*.spec.{ts,tsx}",
        "!src/__tests__/**/*",
    ],
    coverageDirectory: "coverage",
    coverageReporters: ["text", "lcov", "html"],

    // Mock cleanup
    clearMocks: true,
    resetMocks: false,
    restoreMocks: true,

    // Avoid "module is already linked" error
    resetModules: false,

    // Test timeout (some tests may need more time)
    testTimeout: 10000,

    // Disable watchman (conflicts with pnpm symlinks)
    watchman: false,
};

export default baseConfig;

