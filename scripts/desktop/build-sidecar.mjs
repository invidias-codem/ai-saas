import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sidecarForHost } from './sidecar-targets.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const target = sidecarForHost(process.platform, process.arch);
if (!target) {
  throw new Error('Unsupported desktop sidecar target: ' + process.platform + '/' + process.arch);
}
const suffix = target.goos === 'windows' ? '.exe' : '';
const output = path.join(root, 'src-tauri/binaries', 'lattice-harness-' + target.triple + suffix);
mkdirSync(path.dirname(output), { recursive: true });
execFileSync('go', ['-C', path.join(root, 'go-harness'), 'build', '-trimpath', '-o', output, './cmd/lattice-harness'], {
  stdio: 'inherit',
  env: { ...process.env, GOOS: target.goos, GOARCH: target.goarch },
});
console.log('Built desktop sidecar for ' + target.triple);
