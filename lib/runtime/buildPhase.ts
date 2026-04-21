export function isBuildPhase(): boolean {
  return process.env.NEXT_PHASE === 'phase-production-build';
}

export function shouldQuietBuildLogs(): boolean {
  return isBuildPhase() || process.env.CI === 'true';
}
