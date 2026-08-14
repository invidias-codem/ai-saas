// lib/bundler/index.ts
// Frontend fast-path: in-browser transpilation via esbuild-wasm.
// Rewrites bare imports to esm.sh so the browser can fetch them natively.

import * as esbuild from 'esbuild-wasm';

let isInitialized = false;

export const initializeBundler = async (): Promise<void> => {
  if (isInitialized) return;

  await esbuild.initialize({
    worker: true,
    wasmURL: 'https://unpkg.com/esbuild-wasm@0.20.0/esbuild.wasm',
  });

  isInitialized = true;
};

export const transpileCode = async (rawCode: string): Promise<string> => {
  if (!isInitialized) {
    throw new Error('esbuild-wasm not initialized');
  }

  const browserCdnPlugin: esbuild.Plugin = {
    name: 'browser-cdn-plugin',
    setup(build: esbuild.PluginBuild) {
      build.onResolve({ filter: /^index\.tsx$/ }, () => {
        return { path: 'index.tsx', namespace: 'virtual-fs' };
      });

      build.onResolve({ filter: /^[^./]/ }, (args) => {
        return {
          path: `https://esm.sh/${args.path}?bundle`,
          external: true,
        };
      });

      build.onLoad({ filter: /^index\.tsx$/, namespace: 'virtual-fs' }, () => {
        return {
          contents: rawCode,
          loader: 'tsx',
        };
      });
    },
  };

  const result = await esbuild.build({
    entryPoints: ['index.tsx'],
    bundle: true,
    write: false,
    plugins: [browserCdnPlugin],
    format: 'esm',
    target: 'es2020',
    jsx: 'automatic',
  });

  return result.outputFiles[0].text;
};

export interface VirtualFile {
  path: string;   // e.g. 'components/TaskList.tsx' or 'app/page.tsx'
  content: string;
}

// Map a generated relative import ('./TaskItem', '../components/Foo') to a
// virtual-fs path so sibling files resolve within the bundle.
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

/**
 * Multi-file bundle: builds a whole generated app from a virtual filesystem.
 * Bare imports (react, lucide-react, ...) are rewritten to esm.sh externals;
 * relative imports resolve against the generated file set. The entry is the
 * top-level page (or the file that imports the most other generated files).
 *
 * The output module ends by mounting <App /> into #root, so the runner HTML
 * only needs to provide React + react-dom via esm.sh and a root element.
 */
export const transpileProject = async (files: VirtualFile[]): Promise<string> => {
  if (!isInitialized) {
    throw new Error('esbuild-wasm not initialized');
  }

  // Normalize: strip leading ./ or / and index files
  const fsMap = new Map<string, string>();
  for (const f of files) {
    const p = f.path.replace(/^\.?\//, '');
    fsMap.set(p, f.content);
  }

  // Choose entry: prefer a generated page, then App, then the import-graph
  // root (a component nothing else imports — typically the top of the tree).
  // Only tsx/ts component files are candidates; skip scaffold configs.
  const componentFiles = [...fsMap.keys()].filter(p =>
    /\.(tsx|ts|jsx|js)$/.test(p) && !/(^|\/)(package\.json|tsconfig|next\.config|tailwind\.config|postcss\.config|globals\.css|layout\.tsx$)/.test(p)
  );

  const imported = new Set<string>();
  for (const [, content] of fsMap) {
    for (const m of content.matchAll(/from\s+['"](\.{1,2}\/[^'"]+)['"]/g)) {
      // mark the resolved basename so we can find un-imported roots
      imported.add(m[1].split('/').pop() || '');
    }
  }

  const roots = componentFiles.filter(p => {
    const base = p.split('/').pop()!.replace(/\.(tsx|ts|jsx|js)$/, '');
    return !imported.has(base);
  });

  const entry =
    componentFiles.find(p => /(^|\/)page\.tsx$/.test(p)) ||
    componentFiles.find(p => /(^|\/)App\.tsx$/.test(p)) ||
    roots.find(p => /Calculator|Main|Home|Root|Page|App/i.test(p)) ||
    roots[0] ||
    componentFiles[0] ||
    [...fsMap.keys()][0];
  if (!entry) throw new Error('No files to bundle');

  const findFile = (base: string): string | null => {
    for (const ext of VIRTUAL_EXTENSIONS) {
      if (fsMap.has(base + ext)) return base + ext;
    }
    // index resolution
    for (const ext of VIRTUAL_EXTENSIONS) {
      if (ext && fsMap.has(`${base}/index${ext}`)) return `${base}/index${ext}`;
    }
    return null;
  };

  const projectPlugin: esbuild.Plugin = {
    name: 'project-fs-plugin',
    setup(build: esbuild.PluginBuild) {
      build.onResolve({ filter: /^__entry__$/ }, () => ({
        path: '__entry__',
        namespace: 'virtual-entry',
      }));

      build.onLoad({ filter: /.*/, namespace: 'virtual-entry' }, () => {
        // Resolve the entry's component: prefer default export, fall back to
        // a named export matching the file basename, then first named export.
        const base = entry.split('/').pop()!.replace(/\.(tsx|ts|jsx|js)$/, '');
        return {
          contents: `
          import React from 'react';
          import { createRoot } from 'react-dom/client';
          import * as __entry from './${entry.replace(/\.(tsx|ts|jsx|js)$/, '')}';

          const App = __entry.default || __entry['${base}'] || Object.values(__entry).find(v => typeof v === 'function');

          const host = document.getElementById('preview-host') || document.body;
          const mount = document.createElement('div');
          mount.id = 'root';
          mount.style.height = '100%';
          host.innerHTML = '';
          host.appendChild(mount);
          createRoot(mount).render(React.createElement(App));
        `,
          loader: 'tsx',
          resolveDir: '/',
        };
      });

      build.onResolve({ filter: /^[^./]/ }, (args) => ({
        path: `https://esm.sh/${args.path}?bundle`,
        external: true,
      }));

      build.onResolve({ filter: /^\.{1,2}\// }, (args) => {
        const importerPath = args.importer.replace(/^.*?\//, '') || entry;
        const resolvedBase = resolveRelative(importerPath === args.importer ? importerPath : importerPath, args.path);
        const match = findFile(resolvedBase.replace(/^\.?\//, ''));
        if (match) return { path: match, namespace: 'vfs' };
        // Unknown relative import — treat as external CDN last resort
        return { path: `https://esm.sh/${args.path}?bundle`, external: true };
      });

      build.onLoad({ filter: /.*/, namespace: 'vfs' }, (args) => {
        const contents = fsMap.get(args.path) || '';
        const loader = args.path.endsWith('.css') ? 'css'
          : args.path.endsWith('.tsx') ? 'tsx'
          : args.path.endsWith('.ts') ? 'ts'
          : args.path.endsWith('.jsx') ? 'jsx'
          : 'js';
        return { contents, loader, resolveDir: '/' };
      });
    },
  };

  const result = await esbuild.build({
    entryPoints: ['__entry__'],
    bundle: true,
    write: false,
    plugins: [projectPlugin],
    format: 'esm',
    target: 'es2020',
    jsx: 'automatic',
    absWorkingDir: '/',
  });

  return result.outputFiles[0].text;
};
