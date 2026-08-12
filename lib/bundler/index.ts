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
