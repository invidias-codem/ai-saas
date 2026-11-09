#!/usr/bin/env node
/**
 * Human-approved, synthetic-only Code Builder screenshot capture.
 * Does not export Clerk cookies, browser storage, or full-page user data.
 */
import { chromium } from 'playwright';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { parseTarget } from './qa-policy.mjs';

const args = process.argv.slice(2);
if (args.length !== 6 || args[0] !== '--url' ||
    args[2] !== '--selector' || args[4] !== '--out') {
  throw new Error('Usage: node scripts/launch/capture-code-builder.mjs --url https://gen1e.xyz/en/code/builder --selector ".reviewed-region" --out /tmp/captures');
}
if (!stdin.isTTY || !stdout.isTTY)
  throw new Error('A real product screenshot requires interactive human approval; CI capture is disabled');

const target = parseTarget(args[1], 'builder');
if (target.preview)
  throw new Error('Use an approved production sample environment for human capture');
const selector = args[3];
if (!selector || selector.length > 150 || /[{}<>]/.test(selector))
  throw new Error('A short, explicitly reviewed CSS selector is required');
const output = resolve(args[5]);

const rl = createInterface({ input: stdin, output: stdout });
let browser;
try {
  browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.goto(target.url, { waitUntil: 'domcontentloaded' });
  console.log('Sign in manually, then build a disposable synthetic sample project.');
  console.log('No client projects, personal records, real repositories or credentials.');
  console.log('Inspect every visible element in the selected capture region.');
  const approval = await rl.question('Type CAPTURE SYNTHETIC to approve one element screenshot: ');
  if (approval !== 'CAPTURE SYNTHETIC')
    throw new Error('Capture canceled; explicit approval missing');

  const current = new URL(page.url());
  if (current.origin !== target.origin || current.pathname !== target.path)
    throw new Error('Browser is no longer on the approved Code Builder route');
  const element = page.locator(selector);
  if ((await element.count()) !== 1 || !(await element.isVisible()))
    throw new Error('Reviewed selector must match exactly one visible element');

  const shown = await element.innerText();
  const sensitive = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|(?:ghp_|gho_|ghs_|sk_live_|sk_test_|sb_secret_|apify_api_)[A-Za-z0-9_-]{8,}/i;
  if (sensitive.test(shown))
    throw new Error('Possible email or credential visible in the selected region');
  await mkdir(output, { recursive: true });
  const filename = join(output, 'code-builder-synthetic-review.png');
  await element.screenshot({
    path: filename,
    animations: 'disabled',
    mask: [element.locator('input[type="password"],[data-sensitive],[data-private],[autocomplete="email"]')],
  });
  console.log('Saved CANDIDATE only. Require second-person redaction review:', filename);
  await context.close();
} finally {
  rl.close();
  if (browser) await browser.close();
}
