#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const cwd = process.cwd();
const tsSourcePath = resolve(cwd, 'src/scripts/generateApiKey.ts');
const jsDistPath = resolve(cwd, 'dist/scripts/generateApiKey.js');

const preferTsx = process.env.ANYCRAWL_USE_TSX === '1' || process.env.NODE_ENV === 'test' || !!process.env.JEST_WORKER_ID;
const hasTsSource = existsSync(tsSourcePath);

const useTsx = preferTsx && hasTsSource;
const runner = useTsx ? 'tsx' : 'node';
const target = useTsx ? tsSourcePath : jsDistPath;

const args = process.argv.slice(2);
const result = spawnSync(runner, [target, ...args], { stdio: 'inherit', shell: false });

process.exit(result.status ?? 0);
