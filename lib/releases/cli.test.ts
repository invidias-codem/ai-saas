import { CLI_TARGETS, CliReleaseSchema, cliAssetUrl, parseCliCatalog, verificationCommand } from './cli';

const candidate = () => ({ version: '0.3.1-rc.1', channel: 'candidate' as const, sourceCommit: 'a'.repeat(40),
  publishedAt: '2026-10-17T12:00:00Z', provenanceVerified: true as const, securityReviewed: true as const,
  deploymentSmokeTested: false, rollbackTested: false,
  artifacts: CLI_TARGETS.map(t => ({ target: t.id, sha256: 'b'.repeat(64), size: 12_000_000, smokeTested: true as const, nativeSigned: false })),
});

describe('reviewed CLI release catalog', () => {
  test('no release or invalid data exposes no downloads', () => {
    expect(parseCliCatalog({ schemaVersion: 1, release: null })).toBeNull();
    expect(parseCliCatalog({ schemaVersion: 1, release: { version: 'latest' } })).toBeNull();
  });
  test('requires every target exactly once', () => {
    const release = candidate();
    release.artifacts[1] = release.artifacts[0];
    expect(CliReleaseSchema.safeParse(release).success).toBe(false);
  });
  test('stable status requires deployment, rollback, and platform signing evidence', () => {
    const release = { ...candidate(), version: '0.3.1', channel: 'stable' };
    expect(CliReleaseSchema.safeParse(release).success).toBe(false);
    expect(CliReleaseSchema.safeParse({ ...release, deploymentSmokeTested: true, rollbackTested: true,
      artifacts: release.artifacts.map(a => ({ ...a, nativeSigned: true })) }).success).toBe(true);
  });
  test('rejects path injection, untrusted mirrors, and missing provenance', () => {
    expect(() => cliAssetUrl({ ...candidate(), version: '../main' }, 'install.sh')).toThrow();
    expect(() => cliAssetUrl(candidate(), 'https://evil.test/install')).toThrow();
    expect(CliReleaseSchema.safeParse({ ...candidate(), provenanceVerified: false }).success).toBe(false);
    expect(CliReleaseSchema.safeParse({ ...candidate(), url: 'https://evil.test' }).success).toBe(false);
  });
  test('downloads and verification are pinned to the exact repository, version and source commit', () => {
    const release = candidate();
    expect(cliAssetUrl(release, 'lattice-linux-amd64')).toBe('https://github.com/invidias-codem/ai-saas/releases/download/cli-v0.3.1-rc.1/lattice-linux-amd64');
    expect(verificationCommand(release, 'install.sh')).toContain(`--source-digest ${release.sourceCommit}`);
    expect(verificationCommand(release, 'install.sh')).toContain('--signer-workflow invidias-codem/ai-saas/.github/workflows/build-lattice-cli.yml');
  });
});
