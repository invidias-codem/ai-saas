#!/usr/bin/env node
/**
 * scripts/copy-tree-sitter-wasm.ts
 *
 * Copies compiled tree-sitter WASM files to public/tree-sitter/ for deployment.
 *
 * Usage:
 *   pnpm tsx scripts/copy-tree-sitter-wasm.ts
 *
 * This script runs at build time (or CI) to stage WASM assets for Vercel.
 * It assumes web-tree-sitter and language packages are installed.
 *
 * Requirements:
 * - web-tree-sitter installed
 * - tree-sitter-<lang> packages installed (or their .wasm files available)
 * - Run after `pnpm install` and before `pnpm build`
 */

import fs from 'fs';
import path from 'path';

const TREE_SITTER_WASM_DIR = 'tree-sitter';
const PUBLIC_DIR = 'public/tree-sitter';

// Language packages that provide WASM files
// These are npm packages that bundle the compiled WASM
const LANGUAGE_PACKAGES: Record<string, string> = {
  typescript: 'tree-sitter-typescript',
  javascript: 'tree-sitter-javascript',
  tsx: 'tree-sitter-tsx',
  jsx: 'tree-sitter-tsx',
  go: 'tree-sitter-go',
  python: 'tree-sitter-python',
  c: 'tree-sitter-c',
  cpp: 'tree-sitter-cpp',
  rust: 'tree-sitter-rust',
  java: 'tree-sitter-java',
};

const CORE_WASM = 'tree-sitter.wasm';

async function copyWasmFiles(): Promise<void> {
  console.log('[copy-tree-sitter-wasm] Starting WASM copy to public/tree-sitter/...');

  // Ensure output directory exists
  if (!fs.existsSync(PUBLIC_DIR)) {
    fs.mkdirSync(PUBLIC_DIR, { recursive: true });
    console.log(`[copy-tree-sitter-wasm] Created ${PUBLIC_DIR}`);
  }

  let copied = 0;
  let skipped = 0;
  let errors = 0;

  // 1. Copy core tree-sitter.wasm
  try {
    const corePkg = 'web-tree-sitter';
    const coreWasmPath = path.resolve(process.cwd(), 'node_modules', corePkg, CORE_WASM);
    const destPath = path.resolve(PUBLIC_DIR, CORE_WASM);

    if (fs.existsSync(coreWasmPath)) {
      fs.copyFileSync(coreWasmPath, destPath);
      const size = fs.statSync(destPath).size;
      console.log(`[copy-tree-sitter-wasm] ✓ Copied ${CORE_WASM} (${(size / 1024).toFixed(1)} KB)`);
      copied++;
    } else {
      console.warn(`[copy-tree-sitter-wasm] ✗ Core WASM not found at ${coreWasmPath}`);
      errors++;
    }
  } catch (err) {
    console.error(`[copy-tree-sitter-wasm] Error copying core WASM:`, err);
    errors++;
  }

  // 2. Copy language-specific WASM files
  for (const [lang, pkgName] of Object.entries(LANGUAGE_PACKAGES)) {
    try {
      // Try multiple possible locations for the WASM file
      const possiblePaths = [
        // Standard location in package
        path.resolve(process.cwd(), 'node_modules', pkgName, `${pkgName}.wasm`),
        // Alternative location
        path.resolve(process.cwd(), 'node_modules', pkgName, 'tree-sitter.wasm'),
        // Web-tree-sitter specific location (some packages put it here)
        path.resolve(process.cwd(), 'node_modules', pkgName, 'dist', `${pkgName}.wasm`),
      ];

      let wasmFound = false;
      for (const srcPath of possiblePaths) {
        if (fs.existsSync(srcPath)) {
          const destPath = path.resolve(PUBLIC_DIR, `tree-sitter-${lang}.wasm`);
          fs.copyFileSync(srcPath, destPath);
          const size = fs.statSync(destPath).size;
          console.log(`[copy-tree-sitter-wasm] ✓ Copied tree-sitter-${lang}.wasm (${(size / 1024).toFixed(1)} KB) from ${path.relative(process.cwd(), srcPath)}`);
          copied++;
          wasmFound = true;
          break;
        }
      }

      if (!wasmFound) {
        console.warn(`[copy-tree-sitter-wasm] ⚠ WASM for ${lang} (${pkgName}) not found in any expected location`);
        skipped++;
      }
    } catch (err) {
      console.error(`[copy-tree-sitter-wasm] Error copying ${lang}:`, err);
      errors++;
    }
  }

  // Summary
  console.log('\n[copy-tree-sitter-wasm] Summary:');
  console.log(`  Copied: ${copied} files`);
  console.log(`  Skipped: ${skipped} files`);
  console.log(`  Errors: ${errors} files`);

  if (errors > 0) {
    console.warn('\n[copy-tree-sitter-wasm] Some files had errors. Check that web-tree-sitter and language packages are installed.');
    process.exitCode = 1;
  } else {
    console.log('\n[copy-tree-sitter-wasm] ✓ All required WASM files staged to public/tree-sitter/');
  }
}

// Run
copyWasmFiles().catch(err => {
  console.error('[copy-tree-sitter-wasm] Fatal error:', err);
  process.exit(1);
});