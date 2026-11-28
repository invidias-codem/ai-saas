import { CLI_TARGETS, type CliRelease } from '@/lib/releases/cli';
import { terminalInstallCommands } from './commands';

const candidate = (): CliRelease => ({
  version: '0.3.1-rc.1', channel: 'candidate', sourceCommit: 'a'.repeat(40),
  publishedAt: '2026-10-31T12:00:00Z', provenanceVerified: true, securityReviewed: true,
  deploymentSmokeTested: false, rollbackTested: false,
  artifacts: CLI_TARGETS.map(target => ({ target: target.id, sha256: 'b'.repeat(64), size: 12_000_000, smokeTested: true, nativeSigned: false })),
});

describe('terminal installation instructions', () => {
  test('does not provide commands for an unreleased CLI', () => {
    expect(terminalInstallCommands(null, 'linux')).toBeNull();
  });
  test.each(['windows', 'macos', 'linux'] as const)('pins %s commands to the reviewed release and verifies the script before execution', platform => {
    const release = candidate();
    const commands = terminalInstallCommands(release, platform)!;
    expect(commands.download).toContain('gh release download cli-v0.3.1-rc.1 --repo invidias-codem/ai-saas');
    expect(commands.download).toContain(`--source-digest ${release.sourceCommit}`);
    expect(commands.download).toContain('gh attestation verify');
    expect(commands.download).not.toMatch(/curl|Invoke-Expression|bash|SourceCommit/);
    expect(commands.review).toContain(platform === 'windows' ? 'Get-Content' : 'less');
    expect(commands.install).toContain(release.sourceCommit);
    expect(commands.install).toContain(platform === 'windows' ? 'install.ps1' : 'install.sh');
  });
  test('rejects malformed catalog values before producing executable text', () => {
    expect(() => terminalInstallCommands({ ...candidate(), version: '1; malicious' }, 'linux')).toThrow();
    expect(() => terminalInstallCommands({ ...candidate(), sourceCommit: '$(malicious)' }, 'windows')).toThrow();
  });
});
