/**
 * Product Hunt launch QA with eight browser screenshots.
 * Optional authenticated Code Builder screenshots and model-generation tests
 * are explicitly gated and must use a synthetic-only test account.
 */
import { chromium, webkit, type Browser, type BrowserContext, type Page } from 'playwright';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  LAUNCH_VIEWPORTS, normalizeLaunchUrl, assertCaptureConsent,
} from '../../lib/launch/qaSafety';

type Theme = 'light' | 'dark';
type Evidence = { width: number; theme: Theme; ok: boolean; checks: string[]; screenshot?: string; error?: string };
function safeError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);
  const secret = process.env.VERCEL_OIDC_TOKEN;
  return secret ? message.replaceAll(secret, '[redacted]') : message;
}
async function protectedRoute(context: BrowserContext, origin: string) {
  const token = process.env.VERCEL_OIDC_TOKEN;
  if (!token) return;
  // Origin-scoped headers: never disclose the OIDC token to Clerk, CDNs, or
  // any other third party loaded by the page.
  await context.route('**/*', async route => {
    if (new URL(route.request().url()).origin !== origin) return route.continue();
    return route.continue({ headers: {
      ...route.request().headers(),
      'x-vercel-trusted-oidc-idp-token': token,
    } });
  });
}
async function insideWidth(page: Page, selector: string, label: string) {
  const loc = page.locator(selector).first();
  if (!await loc.isVisible()) throw new Error(label + ' is hidden');
  await loc.scrollIntoViewIfNeeded();
  const rect = await loc.boundingBox();
  if (!rect || rect.x < -2 || rect.x + rect.width > page.viewportSize()!.width + 2) {
    throw new Error(label + ' is horizontally clipped');
  }
}
async function checkLaunch(page: Page, launchUrl: string, width: number, theme: Theme) {
  const checks: string[] = [];
  const response = await page.goto(launchUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
  if (response?.status() !== 200) throw new Error('Launch route is not HTTP 200; check deployment protection');
  await page.locator('.lm-page').waitFor({ timeout: 20000 });
  await page.waitForFunction(t =>
    document.querySelector('.lm-page')?.getAttribute('data-theme') === t, theme,
  { timeout: 15000 });
  checks.push('Public route, Lattice render, theme');
  if (!(await page.locator('#hero-title').textContent())?.includes('Make something')) {
    throw new Error('Launch heading missing');
  }
  if (!(await page.locator('meta[name="robots"]').getAttribute('content'))?.includes('noindex')) {
    throw new Error('Unapproved launch route must remain noindex');
  }
  checks.push('Launch copy, noindex');
  if (await page.locator('a[href="/en/code/builder"]').count() < 2) {
    throw new Error('Code Builder CTAs missing');
  }
  await insideWidth(page, '.lm-nav-cta', 'Header Code Builder link');
  await insideWidth(page, '.lm-hero-actions a[href="/en/code/builder"]', 'Hero Code Builder link');
  await insideWidth(page, '.lm-theme', 'Theme control');
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  if (scrollWidth > width + 2) throw new Error('Page horizontal overflow: '+scrollWidth+'px');
  checks.push('CTA visibility, no horizontal overflow at '+width+'px');

  const steps = page.locator('.lm-preview-tabs button');
  if (await steps.count() !== 3) throw new Error('Three walkthrough controls not found');
  await steps.nth(1).click();
  await page.getByRole('heading', { name: 'From words to a plan.' }).waitFor();
  await steps.nth(2).click();
  await page.getByRole('heading', { name: /See what you.re creating/ }).waitFor();
  await steps.nth(0).click();
  await page.getByRole('heading', { name: 'Give the idea a direction.' }).waitFor();
  checks.push('Interactive Describe / Plan / Inspect');

  const other: Theme = theme === 'dark' ? 'light' : 'dark';
  await page.getByRole('button', { name: 'Switch to '+other+' mode' }).click();
  await page.waitForFunction(t =>
    document.querySelector('.lm-page')?.getAttribute('data-theme') === t, other);
  await page.getByRole('button', { name: 'Switch to '+theme+' mode' }).click();
  await page.waitForFunction(t =>
    document.querySelector('.lm-page')?.getAttribute('data-theme') === t, theme);
  checks.push('Theme control and accessible label');
  return checks;
}
const SYNTHETIC_PROMPT =
  'Build a demo-only client intake app using fictional client names and no real contacts. '+
  'Include a mobile-friendly form, status board, and an example dashboard. '+
  'Never include real secrets, accounts, or external copyrighted assets.';

async function checkBuilder(browser: Browser, origin: string, outputDir: string,
  stateFile: string, runBuild: boolean) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }, storageState: stateFile,
    reducedMotion: 'reduce', serviceWorkers: 'block',
  });
  try {
    await protectedRoute(context, origin);
    const page = await context.newPage();
    const res = await page.goto(origin+'/en/code/builder', {
      waitUntil: 'domcontentloaded', timeout: 45000,
    });
    if (res?.status() !== 200) throw new Error('Builder did not return HTTP 200');
    await page.getByRole('heading', { name: 'Code Builder', exact: true }).waitFor({ timeout: 30000 });
    if (runBuild) {
      const reset = page.getByRole('button', { name: 'New Build' });
      if (await reset.isVisible()) await reset.click();
    }
    const prompt = page.locator('textarea').first();
    await prompt.waitFor();
    await prompt.fill(SYNTHETIC_PROMPT);
    const idleImage = path.join(outputDir, 'builder-idle-REVIEW-BEFORE-SHARING.png');
    await page.screenshot({ path: idleImage, fullPage: true, animations: 'disabled' });
    if (!runBuild) return { idleImage, outcome: 'No generation triggered; credits not charged' };
    // Explicit operator opt-in, with potentially paid AI generation.
    await prompt.press('Enter');
    const deadline = Date.now() + 12*60*1000;
    let done = false;
    while (Date.now() < deadline) {
      const text = await page.locator('body').innerText();
      if (/Build needs attention|output was not saved/.test(text)) {
        throw new Error('Build failed or did not save its generated files');
      }
      if (/✓\s*\d+\s*files/.test(text)) { done = true; break; }
      await page.waitForTimeout(4000);
    }
    if (!done) throw new Error('Build did not complete within the 12-minute QA window');
    const codeTab = page.getByRole('button', { name: /^⚙️ Code/ });
    if (await codeTab.isVisible()) await codeTab.click();
    const completedImage = path.join(outputDir, 'builder-completed-REVIEW-BEFORE-SHARING.png');
    await page.screenshot({ path: completedImage, fullPage: true, animations: 'disabled' });
    return { idleImage, completedImage, outcome: 'Saved files verified; review screenshot for PII before release' };
  } finally { await context.close(); }
}

async function main() {
  const flags = new Set(process.argv.slice(2));
  if ([...flags].some(x => !['--capture-builder', '--run-build', '--help'].includes(x))) {
    throw new Error('Unknown flags; supported: --capture-builder, --run-build, --help');
  }
  if (flags.has('--help')) {
    console.log('LAUNCH_QA_BASE_URL=https://preview.example.com pnpm qa:launch [--capture-builder] [--run-build]');
    return;
  }
  const launchUrl = normalizeLaunchUrl(process.env.LAUNCH_QA_BASE_URL || 'http://127.0.0.1:3000');
  const origin = new URL(launchUrl).origin;
  const captureBuilder = flags.has('--capture-builder'), runBuild = flags.has('--run-build');
  const stateFile = process.env.LATTICE_QA_STORAGE_STATE;
  assertCaptureConsent({
    captureBuilder, runBuild, storageState: stateFile,
    syntheticOnly: process.env.LATTICE_QA_SYNTHETIC_ONLY === 'yes',
    creditUseApproved: process.env.LATTICE_QA_ALLOW_BUILD_CHARGES === 'yes',
  });
  if (captureBuilder) await fs.access(stateFile!);
  const engine = process.env.LAUNCH_QA_BROWSER || 'chromium';
  if (!['chromium', 'webkit'].includes(engine)) throw new Error('Browser must be chromium or webkit');
  const outputDir = process.env.LATTICE_QA_OUTPUT_DIR || path.join(os.tmpdir(), 'lattice-launch-qa');
  await fs.mkdir(outputDir, { recursive: true, mode: 0o700 });
  const browser = await (engine === 'webkit' ? webkit : chromium).launch({ headless: true });
  const evidence: Evidence[] = [];
  let builderResult: unknown;
  try {
    for (const v of LAUNCH_VIEWPORTS) for (const theme of ['light','dark'] as const) {
      const context = await browser.newContext({
        viewport: { width: v.width, height: v.height }, reducedMotion: 'reduce',
        deviceScaleFactor: 1, serviceWorkers: 'block',
      });
      try {
        await protectedRoute(context, origin);
        await context.addInitScript((t: Theme) => {
          try { localStorage.setItem('lattice-launch-theme', t); } catch { /* optional */ }
        }, theme);
        const page = await context.newPage();
        const errors: string[] = [];
        page.on('pageerror', err => errors.push(err.message));
        const checks = await checkLaunch(page, launchUrl, v.width, theme);
        if (errors.length) throw new Error('Client runtime error: '+errors.slice(0,2).join(' / '));
        const screenshot = path.join(outputDir, 'launch-'+engine+'-'+v.label+'-'+theme+'.png');
        await page.screenshot({ path: screenshot, fullPage: true, animations: 'disabled' });
        evidence.push({ width: v.width, theme, ok: true, checks, screenshot });
      } catch (e) {
        evidence.push({ width: v.width, theme, ok: false, checks: [], error: safeError(e) });
      } finally { await context.close(); }
    }
    if (captureBuilder) {
      try { builderResult = await checkBuilder(browser, origin, outputDir, stateFile!, runBuild); }
      catch (e) { builderResult = { error: safeError(e) }; }
    }
  } finally { await browser.close(); }
  await fs.writeFile(path.join(outputDir, 'launch-acceptance.json'),
    JSON.stringify({
      origin, browser: engine, at: new Date().toISOString(),
      reminder: 'Browser emulation is not physical iOS Safari QA. Manual PII review required.',
      evidence, builder: builderResult ?? 'Not requested',
    }, null, 2), { mode: 0o600 });
  const bad = evidence.filter(e => !e.ok);
  console.log('Launch QA '+(evidence.length-bad.length)+'/'+evidence.length+' passed; evidence: '+outputDir);
  for (const e of bad) console.error(e.width+'px '+e.theme+': '+e.error);
  if (builderResult && typeof builderResult === 'object' && 'error' in builderResult)
    console.error('Builder: '+(builderResult as {error:string}).error);
  if (bad.length || (builderResult && typeof builderResult==='object' && 'error' in builderResult)) process.exitCode = 1;
}
main().catch(e => { console.error('Launch QA error: '+safeError(e)); process.exitCode = 1; });
