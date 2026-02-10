import baseConfig from "../../jest.config.base.mjs";

const config = {
    ...baseConfig,
    // Add setup file
    setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
};

export default config;