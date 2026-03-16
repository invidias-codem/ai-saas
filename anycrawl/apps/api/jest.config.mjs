import baseConfig from "../../jest.config.base.mjs";

const config = {
    ...baseConfig,
    // Run tests in single worker to avoid module linking conflicts
    maxWorkers: 1,
    // No need to skip tests after rewriting with dynamic imports
};

export default config; 