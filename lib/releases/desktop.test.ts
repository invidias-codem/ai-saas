import { DESKTOP_PACKAGES, DesktopReleaseSchema, desktopAssetUrl, parseDesktopCatalog } from './desktop';

const candidate = () => ({
  version: '0.1.0-rc.1', channel: 'candidate' as const, sourceCommit: 'a'.repeat(40),
  publishedAt: '2026-10-30T12:00:00Z', provenanceVerified: true as const, securityReviewed: true as const,
  recoveryTested: false, upgradeTested: false, rollbackTested: false,
  artifacts: DESKTOP_PACKAGES.map(p => ({ target: p.id, sha256: 'b'.repeat(64), size: 40_000_000,
    nativeUiTested: true as const, installTested: true as const, nativeSigned: false })),
});

describe('desktop download release authority', () => {
  test('unreleased or malformed catalogs expose no executables', () => {
    expect(parseDesktopCatalog({ schemaVersion: 1, release: null })).toBeNull();
    expect(parseDesktopCatalog({ schemaVersion: 1, release: { version: 'latest' } })).toBeNull();
    expect(parseDesktopCatalog({ schemaVersion: 1, release: { ...candidate(), url: 'https://example.test' } })).toBeNull();
  });
  test('candidate downloads require native UI, installation and security evidence', () => {
    const release = candidate();
    expect(DesktopReleaseSchema.safeParse(release).success).toBe(true);
    expect(DesktopReleaseSchema.safeParse({ ...release, securityReviewed: false }).success).toBe(false);
    release.artifacts[0] = { ...release.artifacts[0], nativeUiTested: false } as never;
    expect(DesktopReleaseSchema.safeParse(release).success).toBe(false);
  });
  test('stable downloads additionally require recovery, upgrades, rollback and Windows signing', () => {
    const release = { ...candidate(), version: '0.1.0', channel: 'stable' };
    expect(DesktopReleaseSchema.safeParse(release).success).toBe(false);
    expect(DesktopReleaseSchema.safeParse({ ...release, recoveryTested: true, upgradeTested: true,
      rollbackTested: true, artifacts: release.artifacts.map(a => ({ ...a, nativeSigned: true })) }).success).toBe(true);
  });
  test('duplicate or unknown targets and mismatched channels are denied', () => {
    const release = candidate();
    expect(DesktopReleaseSchema.safeParse({ ...release, artifacts: [release.artifacts[0], release.artifacts[0]] }).success).toBe(false);
    expect(DesktopReleaseSchema.safeParse({ ...release, channel: 'stable' }).success).toBe(false);
    expect(DesktopReleaseSchema.safeParse({ ...release, artifacts: [{ ...release.artifacts[0], target: 'macos-arm64' }] }).success).toBe(false);
  });
  test('every OS package has a fixed versioned URL and unavailable packages cannot be linked', () => {
    const release = candidate();
    expect(desktopAssetUrl(release, 'windows-x64-setup')).toBe('https://github.com/invidias-codem/ai-saas/releases/download/desktop-v0.1.0-rc.1/lattice-desktop-windows-x64-setup.exe');
    expect(desktopAssetUrl(release, 'linux-x64-appimage')).toMatch(/lattice-desktop-linux-x64\.AppImage$/);
    expect(desktopAssetUrl(release, 'linux-x64-deb')).toMatch(/lattice-desktop-linux-x64\.deb$/);
    expect(() => desktopAssetUrl(release, '../main')).toThrow();
    expect(() => desktopAssetUrl({ ...release, artifacts: release.artifacts.slice(1) }, 'windows-x64-setup')).toThrow();
  });
});
