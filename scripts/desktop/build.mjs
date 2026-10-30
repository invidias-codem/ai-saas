import { build } from 'esbuild';
import { copyFile, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const output = path.join(root, 'desktop/dist');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await build({ entryPoints: [path.join(root, 'desktop/main.ts')], outfile: path.join(output, 'workspace.js'),
  bundle: true, minify: true, sourcemap: false, format: 'esm', platform: 'browser', target: ['es2020'],
  tsconfig: path.join(root, 'desktop/tsconfig.json'), legalComments: 'none',
});
await Promise.all(['index.html', 'workspace.css'].map(name => copyFile(path.join(root, 'desktop', name), path.join(output, name))));
console.log('Bundled desktop workspace: desktop/dist (no development server required)');
