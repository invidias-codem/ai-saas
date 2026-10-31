import { getCliRelease } from '@/lib/releases/cli';
import { terminalInstallCommands } from '@/lib/install/commands';
import type { DesktopPlatform } from '@/lib/install/platform';
import { CopyCommand } from './copy-command';

export function TerminalInstall({ platform }: { platform: DesktopPlatform }) {
  const release = getCliRelease();
  const commands = terminalInstallCommands(release, platform);
  return <section className="rounded-2xl border border-slate-700 bg-slate-900/50 p-5">
    <h3 className="text-xl font-semibold">Install the Lattice CLI</h3>
    <p className="mt-3 text-sm leading-6 text-slate-400">Manage a Docker appliance from {platform === 'windows' ? 'PowerShell' : 'your terminal'}. This installs the command-line tool; the desktop app has its own installer.</p>
    {release && commands ? <>
      <p className="mt-4 text-sm text-amber-200">{release.channel === 'stable' ? 'Stable release' : 'Release candidate for evaluation'} · {release.version}</p>
      <p className="mt-4 text-sm text-slate-300">1. Install GitHub CLI (gh), then download and verify the installer in an empty folder.</p>
      <CopyCommand command={commands.download} />
      <p className="mt-4 text-sm text-slate-300">2. Read the installer before running it.</p>
      <CopyCommand command={commands.review} />
      <details className="mt-4 text-sm text-slate-300"><summary className="min-h-11 cursor-pointer">3. After reviewing, install this version</summary><CopyCommand command={commands.install} /></details>
      <p className="mt-4 text-xs leading-6 text-slate-400">Python is bundled. Deployment commands require Docker Engine with Compose v2. Check the OS and processor requirements on the downloads page.</p>
    </> : <p role="status" className="mt-5 rounded-xl border border-amber-300/20 bg-amber-300/5 p-4 text-sm leading-6 text-amber-100">The first verified CLI release is being prepared. Installation commands will appear here when a reviewed release is available.</p>}
  </section>;
}
