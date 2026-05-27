"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isBuildPhase = isBuildPhase;
exports.shouldQuietBuildLogs = shouldQuietBuildLogs;
function isBuildPhase() {
    return process.env.NEXT_PHASE === 'phase-production-build';
}
function shouldQuietBuildLogs() {
    return isBuildPhase() || process.env.CI === 'true';
}
