import { CLI_REPOSITORY, cliAssetUrl, verificationCommand, type CliRelease } from '@/lib/releases/cli';
import type { DesktopPlatform } from './platform';

/** No commands are offered until the existing reviewed release gate approves them. */
export function terminalInstallCommands(release: CliRelease | null, platform: DesktopPlatform) {
  if (!release) return null;
  const windows = platform === 'windows';
  const script = windows ? 'install.ps1' : 'install.sh';
  cliAssetUrl(release, script); // Validate the release and fixed asset before interpolating.
  const tag = `cli-v${release.version}`;
  return {
    download: `gh release download ${tag} --repo ${CLI_REPOSITORY} --pattern ${script}\n${verificationCommand(release, script)}`,
    review: windows ? 'Get-Content .\\install.ps1' : 'less ./install.sh',
    install: windows ? `.\\install.ps1 -Version ${tag} -SourceCommit ${release.sourceCommit}` : `bash ./install.sh ${tag} ${release.sourceCommit}`,
  };
}
