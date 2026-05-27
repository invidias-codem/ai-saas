"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HarnessFactory = void 0;
const GoIOHarness_1 = require("./GoIOHarness");
class HarnessFactory {
    static async create(config) {
        if (config.env === 'local') {
            const harness = new GoIOHarness_1.GoIOHarness(config.workspaceRoot);
            await harness.initialize();
            return harness;
        }
        if (config.env === 'antigravity') {
            throw new Error('Antigravity harness not yet implemented.');
        }
        throw new Error(`Unsupported harness environment: ${config.env}`);
    }
}
exports.HarnessFactory = HarnessFactory;
