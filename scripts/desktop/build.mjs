import { build } from 'esbuild';
import { copyFile, mkdir, rm, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const source = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
if (!/^[a-f0-9]{40}$/.test(source)) throw new Error('The desktop build requires an exact source commit');
const { version } = JSON.parse(await readFile(path.join(root, 'src-tauri/tauri.preview.conf.json'), 'utf8'));
if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:-[a-z0-9.]+)?$/.test(version)) throw new Error('Invalid desktop version');
const output = path.join(root, 'desktop/dist');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await build({ entryPoints: [path.join(root, 'desktop/main.ts')], outfile: path.join(output, 'workspace.js'),
  bundle: true, minify: true, sourcemap: false, format: 'esm', platform: 'browser', target: ['es2020'],
  tsconfig: path.join(root, 'desktop/tsconfig.json'), legalComments: 'none',
  define: { __LATTICE_BUILD__: JSON.stringify({ version, source }) },
});
await Promise.all(['index.html', 'workspace.css'].map(name => copyFile(path.join(root, 'desktop', name), path.join(output, name))));
console.log('Bundled desktop workspace: desktop/dist (no development server required)');
