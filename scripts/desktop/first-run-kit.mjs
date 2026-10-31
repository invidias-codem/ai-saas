import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const welcomeText = 'Welcome to your Lattice OS test workspace.\n\nThis is a disposable sample file, not a personal document.\nUTF-8 check: café.\n\nRead this file first. Then create my-first-change.txt through native review.\n';

export async function writeFirstRunKit(output, platform, source) {
  if (!['windows', 'linux'].includes(platform) || !/^[a-f0-9]{40}$/.test(source)) throw new Error('Invalid first-run package identity');
  const workspace = path.join(output, 'Lattice Test Workspace');
  await mkdir(workspace, { recursive: true });
  await writeFile(path.join(workspace, 'welcome.txt'), welcomeText, { flag: 'wx' });
  const feedback = `Lattice OS Preview test notes\nSource commit: ${source}\nPlatform package: ${platform}-x64\nInstaller SHA-256: see SHA256SUMS\n\nWindows edition/version (winver), or Linux distribution:\nMachine architecture:\nFresh install or earlier preview already present:\n\nInstallation and any Windows security/publisher message:\nFirst launch and local-service status:\nFolder picker and read consent:\nwelcome.txt read / list / inspect:\nWrite consent and separate review window:\nCreate my-first-change.txt and verify in File Explorer:\nClose/reopen and reauthorize folder:\nUninstall (if tested):\n\nFirst failing step:\nExpected result:\nActual result and exact error code/message:\nSteps to reproduce:\nScreenshot attached (remove private paths/content first):\n\nShare this form manually. The app does not send this report automatically.\n`;
  await writeFile(path.join(output, 'TEST-NOTES.txt'), feedback);
  if (platform === 'windows') {
    const guide = await readFile(new URL('./first-run-windows.txt', import.meta.url), 'utf8');
    await writeFile(path.join(output, 'START-HERE-WINDOWS.txt'), `Source commit: ${source}\n\n${guide}`);
  }
}
