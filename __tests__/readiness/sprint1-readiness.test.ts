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

  it('uses a Node version compatible with pnpm 11 in dataset curation CI', () => {
    const workflow = read('.github/workflows/dataset-curation.yml');

    expect(workflow).not.toContain('NODE_VERSION: "20"');
    expect(workflow).toMatch(/NODE_VERSION:\s*"(2[4-9]|[3-9]\d)"/);
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
    expect(sidebar).toContain('useUser');
  });
});
