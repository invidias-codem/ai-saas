import { NextResponse } from 'next/server';
import { env } from '@/lib/env';

interface CronAuthOptions {
  routeName?: string;
  secretEnvVars?: string[];
}

function readBearerToken(req: Request): string | null {
  const authHeader = req.headers.get('authorization')?.trim();
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  return token || null;
}

function readQuerySecret(req: Request): string | null {
  try {
    const url = new URL(req.url);
    return url.searchParams.get('secret')?.trim() || null;
  } catch {
    return null;
  }
}

function configuredSecrets(envVars: string[]): string[] {
  return envVars
    .map((name) => env[name as keyof typeof env])
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter((secret): secret is string => Boolean(secret));
}

/**
 * Authorize public cron routes before they use service-role clients or mutate state.
 *
 * Vercel Cron and external schedulers should send Authorization: Bearer <secret>.
 * The ?secret= query fallback is kept only for manual diagnostics/backwards compatibility.
 */
export function requireCronAuth(
  req: Request,
  options: CronAuthOptions = {}
): NextResponse | null {
  const routeName = options.routeName ?? 'Cron';
  const envVars = options.secretEnvVars ?? ['CRON_SECRET'];
  const secrets = configuredSecrets(envVars);

  if (secrets.length === 0) {
    console.error(`[${routeName}] Missing cron secret env var. Checked: ${envVars.join(', ')}`);
    return NextResponse.json(
      { success: false, error: 'Cron auth is not configured' },
      { status: 500 }
    );
  }

  const provided = readBearerToken(req) ?? readQuerySecret(req);
  if (!provided || !secrets.includes(provided)) {
    return NextResponse.json(
      {
        success: false,
        error: 'Unauthorized',
        hint: 'Pass Authorization: Bearer *** header',
      },
      { status: 401 }
    );
  }

  return null;
}
