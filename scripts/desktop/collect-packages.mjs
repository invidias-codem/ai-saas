import { readdir, readFile, mkdir, rm, copyFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFirstRunKit } from './first-run-kit.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const platform = process.argv[2];
const commit = process.argv[3];
if (!['windows', 'linux'].includes(platform) || !/^[a-f0-9]{40}$/.test(commit ?? '')) throw new Error('Usage: collect-packages.mjs windows|linux <exact-source-sha>');
const formats = platform === 'windows'
  ? [{ dir: 'nsis', extension: '.exe', name: 'lattice-desktop-windows-x64-setup.exe' }]
  : [{ dir: 'appimage', extension: '.AppImage', name: 'lattice-desktop-linux-x64.AppImage' }, { dir: 'deb', extension: '.deb', name: 'lattice-desktop-linux-x64.deb' }];
const output = path.join(root, 'dist/desktop', `${platform}-x64`);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const artifacts = [];
for (const format of formats) {
  const source = path.join(root, 'src-tauri/target/release/bundle', format.dir);
  const files = (await readdir(source)).filter(name => name.endsWith(format.extension));
  if (files.length !== 1) throw new Error(`Expected exactly one ${format.extension} package; found ${files.length}. Clean old build outputs first.`);
  const bytes = await readFile(path.join(source, files[0]));
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  await copyFile(path.join(source, files[0]), path.join(output, format.name));
  artifacts.push({ filename: format.name, size: bytes.length, sha256 });
}
await writeFile(path.join(output, 'SHA256SUMS'), artifacts.map(a => `${a.sha256}  ${a.filename}\n`).join(''));
const manifest = { schemaVersion: 1, channel: 'evaluation', sourceCommit: commit, platform: `${platform}-x64`,
  artifacts, qualification: { nativeUi: 'pending', cleanMachineInstall: 'pending', stableRelease: false } };
await writeFile(path.join(output, 'desktop-build-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
await writeFirstRunKit(output, platform, commit);
await writeFile(path.join(output, 'READ-ME.txt'), `Lattice OS Preview — evaluation packages\nSource commit: ${commit}\n\nCompare SHA256SUMS before installation. These are unsigned test packages, not a stable release.\nWindows: run lattice-desktop-windows-x64-setup.exe (WebView2 bootstrap may require network).\nLinux: install the .deb on Ubuntu 22.04+, or chmod +x the AppImage before opening it.\nThe native dialogs and clean-machine install still require platform verification.\nFolder authorization expires on restart. Task recovery and durable project memory are not yet qualified.\nCommands remain disabled without a qualified sandbox.\n`);
console.log(`Evaluation packages and checksums: ${path.relative(root, output)}`);
