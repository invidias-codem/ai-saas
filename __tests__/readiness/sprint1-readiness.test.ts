import fs from 'fs';
import path from 'path';

const root = process.cwd();

function read(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function listCronRoutes(dir = path.join(root, 'app/api/cron')): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listCronRoutes(full));
    } else if (entry.name === 'route.ts') {
      files.push(full);
    }
  }
  return files;
}

describe('Sprint 1 production readiness hardening', () => {
  it('requires the shared cron auth helper in every public cron route', () => {
    const cronRoutes = listCronRoutes();

    expect(cronRoutes.length).toBeGreaterThan(0);
    const unsecured = cronRoutes
      .filter((file) => !read(path.relative(root, file)).includes('requireCronAuth'))
      .map((file) => path.relative(root, file));

    expect(unsecured).toEqual([]);
  });

  it('lets Vercel Cron invoke the Slack indexer with GET', () => {
    const route = read('app/api/cron/slack-indexer/route.ts');

    expect(route).toMatch(/export\s+async\s+function\s+GET\s*\(/);
    expect(route).toContain('runSlackIndexerCron');
  });

  it('uses Node versions compatible with pnpm 11 in CI workflows touched by sprint 1', () => {
    const datasetWorkflow = read('.github/workflows/dataset-curation.yml');
    const securityWorkflow = read('.github/workflows/security-tests.yml');

    for (const workflow of [datasetWorkflow, securityWorkflow]) {
      expect(workflow).not.toMatch(/node-version:\s*['"]?20(?:\.x)?['"]?/);
      expect(workflow).not.toMatch(/NODE_VERSION:\s*['"]20['"]/);
      expect(workflow).not.toContain('node-version: [20.x]');
    }

    expect(datasetWorkflow).toMatch(/NODE_VERSION:\s*"(2[4-9]|[3-9]\d)"/);
    expect(securityWorkflow).toMatch(/node-version:\s*['"](2[4-9]|[3-9]\d)\.x['"]/);
  });

  it('runs the security workflow when sprint readiness guards or the workflow itself change', () => {
    const securityWorkflow = read('.github/workflows/security-tests.yml');

    expect(securityWorkflow).toContain("'__tests__/readiness/**'");
    expect(securityWorkflow).toContain("'.github/workflows/security-tests.yml'");
  });

  it('sets baseline browser security headers including Permissions-Policy', () => {
    const config = read('next.config.mjs');

    for (const header of [
      'Content-Security-Policy',
      'Strict-Transport-Security',
      'X-Frame-Options',
      'X-Content-Type-Options',
      'Referrer-Policy',
      'Permissions-Policy',
    ]) {
      expect(config).toContain(header);
    }
  });

  it('does not render a hardcoded user identity in the sidebar', () => {
    const sidebar = read('components/sidebar.tsx');

    expect(sidebar).not.toContain('Joshua Mohammed');
    expect(sidebar).not.toContain('>G<');

    // Identity is derived from Clerk's useUser() in the client island — the
    // server wrapper (sidebar.tsx) delegates to SidebarClient (per the RSC
    // server/client boundary split), so assert useUser lives in the client.
    const sidebarClient = read('components/SidebarClient.tsx');
    expect(sidebarClient).toContain('useUser');
  });

  it('sets restrictive CORS headers without wildcards', () => {
    const config = read('next.config.mjs');

    // Must NOT have wildcard CORS
    expect(config).not.toMatch(/Access-Control-Allow-Origin.*\*/);

    // Must have explicit CORS restrictions
    expect(config).toContain('Access-Control-Allow-Origin');
    expect(config).toContain('Access-Control-Allow-Methods');
    expect(config).toContain('Access-Control-Allow-Headers');
    expect(config).toContain('Access-Control-Max-Age');

    // Should include Cross-Origin isolation headers
    expect(config).toContain('Cross-Origin-Opener-Policy');
    expect(config).toContain('Cross-Origin-Resource-Policy');

    // API routes must have separate CORS config
    expect(config).toContain("'/api/:path*'");
  });
});
