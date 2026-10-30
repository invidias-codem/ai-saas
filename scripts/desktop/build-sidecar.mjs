import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const hosts = { 'linux:x64': 'x86_64-unknown-linux-gnu', 'win32:x64': 'x86_64-pc-windows-msvc' };
const target = hosts[`${process.platform}:${process.arch}`];
if (!target) throw new Error('Desktop sidecars are currently qualified only for Windows x64 and Linux x64.');
const output = path.join(root, 'src-tauri/binaries', `lattice-harness-${target}${process.platform === 'win32' ? '.exe' : ''}`);
mkdirSync(path.dirname(output), { recursive: true });
execFileSync('go', ['-C', path.join(root, 'go-harness'), 'build', '-trimpath', '-o', output, './cmd/lattice-harness'], { stdio: 'inherit' });
console.log(`Built desktop sidecar for ${target}`);
