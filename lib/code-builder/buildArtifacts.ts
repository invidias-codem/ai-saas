/** A terminal success must contain a named plan and at least one usable file. */
export function hasBuildArtifacts(plan: unknown, files: unknown): boolean {
  return Boolean(
    plan && typeof plan === 'object' && 'appName' in plan &&
    typeof plan.appName === 'string' && plan.appName.trim().length > 0 &&
    Array.isArray(files) && files.length > 0 && files.every(file =>
      file && typeof file.path === 'string' && file.path.length > 0 &&
      typeof file.content === 'string' && file.content.trim().length > 0,
    ),
  );
}
