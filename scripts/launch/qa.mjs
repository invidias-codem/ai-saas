#!/usr/bin/env node
/**
 * Screenshots ONLY of the anonymous Product Hunt marketing page.
 * No Clerk login, customer data, Code Builder project or browser storage saved.
 * VERCEL_OIDC_TOKEN, when present, is origin-scoped to the allowed Preview.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { chromium } from 'playwright';
import { VIEWPORTS, parseArgs, checkDocumentState } from './qa-policy.mjs';

const { target, output } = parseArgs(process.argv.slice(2));
const dir = resolve(output);
const token = process.env.VERCEL_OIDC_TOKEN;
if (token && target.production)
  throw new Error('Do not send a development OIDC token to production');
await mkdir(dir, { recursive: true });
const results = [];
let browser;
try {
  browser = await chromium.launch({ headless: true });
  for (const width of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width, height: width <= 390 ? 844 : 900 },
      deviceScaleFactor: 1,
      colorScheme: 'light',
      reducedMotion: 'reduce',
      serviceWorkers: 'block',
    });
    // A browser-context extraHTTPHeaders setting would leak the OIDC token to
    // third-party subresources. Route all requests instead and abort outsiders.
    if (token && target.preview) {
      await context.route('**/*', async route => {
        let sameOrigin = false;
        try { sameOrigin = new URL(route.request().url()).origin === target.origin; }
        catch { /* treat invalid URL as external */ }
        if (!sameOrigin) return route.abort();
        return route.continue({
          headers: { ...route.request().headers(), 'x-vercel-trusted-oidc-idp-token': token },
        });
      });
    }
    await context.addInitScript(() => {
      try { localStorage.setItem('lattice-launch-theme', 'light'); } catch { /* optional */ }
    });
    const page = await context.newPage();
    const record = { width, pass: false, screenshotNames: [], failures: [] };
    results.push(record);
    try {
      const response = await page.goto(target.url, {
        waitUntil: 'domcontentloaded', timeout: 45000,
      });
      if (!response || response.status() !== 200)
        throw new Error('Launch page did not return HTTP 200');
      const final = new URL(page.url());
      if (final.origin !== target.origin || final.pathname !== target.path)
        throw new Error('Page redirected away from launch route');
      const surface = page.locator('.lm-page');
      await surface.waitFor({ state: 'visible', timeout: 15000 });
      await page.waitForFunction(() =>
        document.querySelector('.lm-page')?.getAttribute('data-theme') === 'light'
      );
      if (!(await page.title()).includes('Lattice OS'))
        record.failures.push('Incorrect page title');
      const robots = await page.locator('meta[name="robots"]').getAttribute('content');
      if (!robots?.includes('noindex'))
        record.failures.push('Launch candidate must remain noindex');

      if (!(await page.locator('h1#hero-title').isVisible()))
        record.failures.push('Hero is missing');
      const builder = page.getByRole('link', { name: /Try Code Builder/i }).first();
      if (!(await builder.isVisible()) ||
          (await builder.getAttribute('href')) !== '/en/code/builder') {
        record.failures.push('Code Builder CTA is missing or misrouted');
      }
      if (!(await page.getByText('Protected publishing still in testing').isVisible()))
        record.failures.push('Publishing testing disclaimer missing');

      const state = await page.evaluate(() => {
        const ids = [...document.querySelectorAll('[id]')].map(el => el.id);
        const visible = el => {
          const bounds = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          return bounds.width > 0 && bounds.height > 0 &&
            style.display !== 'none' && style.visibility !== 'hidden';
        };
        const unlabeled = [...document.querySelectorAll('button,a[href]')]
          .filter(visible)
          .filter(el => !(el.getAttribute('aria-label') || el.textContent || '').trim())
          .map(el => el.tagName.toLowerCase());
        return {
          main: document.querySelectorAll('main').length === 1,
          h1: document.querySelectorAll('h1').length,
          skip: !!document.querySelector('a.lm-skip[href="#main"]'),
          duplicateIds: ids.filter((id, i) => ids.indexOf(id) !== i),
          unlabeled,
          scrollWidth: document.documentElement.scrollWidth,
          bodyScrollWidth: document.body.scrollWidth,
        };
      });
      record.failures.push(...checkDocumentState(state, width));

      for (const theme of ['light', 'dark']) {
        if (theme === 'dark') {
          await page.getByRole('button', { name: 'Switch to dark mode' }).click();
          await page.waitForFunction(() =>
            document.querySelector('.lm-page')?.getAttribute('data-theme') === 'dark'
          );
        }
        if ((await surface.getAttribute('data-theme')) !== theme)
          record.failures.push('Theme did not activate: ' + theme);
        const overflow = await page.evaluate(() =>
          document.documentElement.scrollWidth > innerWidth + 1
        );
        if (overflow) record.failures.push('Page-level overflow in ' + theme);
        const file = 'launch-' + width + '-' + theme + '.png';
        if (!record.failures.length) {
          await page.screenshot({
            path: join(dir, file), fullPage: true, animations: 'disabled',
          });
          record.screenshotNames.push(file);
        }
      }
      await page.locator('.lm-tab').filter({ hasText: 'Plan' }).click();
      if (!(await page.getByText('From words to a plan.').isVisible()))
        record.failures.push('Plan step failed');
      await page.locator('.lm-tab').filter({ hasText: 'Inspect' }).click();
      if (!(await page.getByText(/See what you.re creating/).isVisible()))
        record.failures.push('Inspect step failed');
      record.pass = record.failures.length === 0;
    } catch (error) {
      record.failures.push(error instanceof Error ? error.message : 'Unknown browser error');
    } finally {
      await context.close();
    }
  }
} finally {
  if (browser) await browser.close();
}
const report = {
  purpose: 'Public launch visual QA only; not Safari or authenticated first-build acceptance',
  target: target.url,
  pass: results.every(row => row.pass),
  results,
};
await writeFile(join(dir, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log('Lattice launch QA:', report.pass ? 'PASS' : 'FAIL');
for (const row of results) {
  console.log(row.width + 'px: ' + (row.pass ? 'PASS' : row.failures.join('; ')));
}
if (!report.pass) process.exitCode = 1;
