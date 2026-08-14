// Verify transpileProject logic using native esbuild (same plugin API).
// Replicates the plugin from lib/bundler/index.ts against the real build output.
import { readFileSync } from 'fs';
import * as esbuild from 'esbuild';

const files = JSON.parse(readFileSync('/tmp/build_files.json', 'utf8'));

const fsMap = new Map<string, string>();
for (const f of files) fsMap.set(f.path.replace(/^\.?\//, ''), f.content);

const componentFiles = [...fsMap.keys()].filter(p =>
  /\.(tsx|ts|jsx|js)$/.test(p) && !/(^|\/)(package\.json|tsconfig|next\.config|tailwind\.config|postcss\.config|globals\.css|layout\.tsx$)/.test(p)
);
const imported = new Set<string>();
for (const [, content] of fsMap) {
  for (const m of content.matchAll(/from\s+['"](\.{1,2}\/[^'"]+)['"]/g)) {
    imported.add(m[1].split('/').pop() || '');
  }
}
const roots = componentFiles.filter(p => !imported.has(p.split('/').pop()!.replace(/\.(tsx|ts|jsx|js)$/, '')));
const entry =
  componentFiles.find(p => /(^|\/)page\.tsx$/.test(p)) ||
  componentFiles.find(p => /(^|\/)App\.tsx$/.test(p)) ||
  roots.find(p => /Calculator|Main|Home|Root|Page|App/i.test(p)) ||
  roots[0] || componentFiles[0] || [...fsMap.keys()][0];

console.log('entry:', entry);
console.log('files:', [...fsMap.keys()].join(', '));

function resolveRelative(importer: string, spec: string): string {
  const baseDir = importer.split('/').slice(0, -1);
  for (const part of spec.split('/')) {
    if (part === '.' || part === '') continue;
    if (part === '..') baseDir.pop();
    else baseDir.push(part);
  }
  return baseDir.join('/');
}
const VIRTUAL_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js', ''];
const findFile = (base: string): string | null => {
  for (const ext of VIRTUAL_EXTENSIONS) if (fsMap.has(base + ext)) return base + ext;
  for (const ext of VIRTUAL_EXTENSIONS) if (ext && fsMap.has(`${base}/index${ext}`)) return `${base}/index${ext}`;
  return null;
};

const projectPlugin: esbuild.Plugin = {
  name: 'project-fs-plugin',
  setup(build) {
    build.onResolve({ filter: /^__entry__$/ }, () => ({ path: '__entry__', namespace: 'virtual-entry' }));
    build.onLoad({ filter: /.*/, namespace: 'virtual-entry' }, () => {
      const base = entry.split('/').pop()!.replace(/\.(tsx|ts|jsx|js)$/, '');
      return {
      contents: `
        import React from 'react';
        import { createRoot } from 'react-dom/client';
        import * as __entry from './${entry.replace(/\.(tsx|ts|jsx|js)$/, '')}';
        const App = __entry.default || __entry['${base}'] || Object.values(__entry).find(v => typeof v === 'function');
        function mount() {
          let host = document.getElementById('preview-host');
          if (!host) { host = document.createElement('div'); host.id='preview-host'; document.body.appendChild(host); }
          const mount = document.createElement('div');
          mount.id = 'root';
          host.innerHTML = '';
          host.appendChild(mount);
          createRoot(mount).render(React.createElement(App));
        }
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
      `,
      loader: 'tsx',
      resolveDir: '/',
      };
    });
    build.onResolve({ filter: /^[^./]/ }, (args) => ({ path: `https://esm.sh/${args.path}?bundle`, external: true }));
    build.onResolve({ filter: /^\.{1,2}\// }, (args) => {
      const importerPath = args.importer.replace(/^.*?\//, '') || entry;
      const resolvedBase = resolveRelative(importerPath, args.path);
      const match = findFile(resolvedBase.replace(/^\.?\//, ''));
      if (match) return { path: match, namespace: 'vfs' };
      return { path: `https://esm.sh/${args.path}?bundle`, external: true };
    });
    build.onLoad({ filter: /.*/, namespace: 'vfs' }, (args) => {
      const contents = fsMap.get(args.path) || '';
      const loader = args.path.endsWith('.css') ? 'css'
        : args.path.endsWith('.tsx') ? 'tsx'
        : args.path.endsWith('.ts') ? 'ts'
        : args.path.endsWith('.jsx') ? 'jsx' : 'js';
      return { contents, loader, resolveDir: '/' };
    });
  },
};

async function main() {
const result = await esbuild.build({  entryPoints: ['__entry__'],
  bundle: true,
  write: false,
  plugins: [projectPlugin],
  format: 'esm',
  target: 'es2020',
  jsx: 'automatic',
  absWorkingDir: '/',
});

const bundle = result.outputFiles[0].text;
console.log('\nBUNDLE OK, length:', bundle.length);
console.log('--- head ---\n' + bundle.slice(0, 300));
console.log('--- tail ---\n' + bundle.slice(-300));
}
main();
