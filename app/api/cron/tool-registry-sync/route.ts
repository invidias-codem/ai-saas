/**
 * Cron: UCOL Tool Registry Sync
 *
 * Runs every 6 hours to verify installed CLI-Anything harnesses
 * and sync their availability/version to Supabase.
 *
 * vercel.json entry:
 *   { "path": "/api/cron/tool-registry-sync", "schedule": "0 * /6 * * *" }
 */

import { NextRequest, NextResponse } from 'next/server';
import { execFile as _execFile } from 'child_process';
import { promisify } from 'util';
import { createClient } from '@supabase/supabase-js';

const execFile = promisify(_execFile);

export const maxDuration = 60;

// ─── Known harnesses ─────────────────────────────────────────────────────────

const KNOWN_HARNESSES = [
  {
    name: 'supabase',
    binary: 'cli-anything-supabase',
    capabilities: ['project', 'db', 'migration', 'functions', 'inspect', 'status'],
    taskTypes: ['database_query', 'migration', 'db_inspect', 'edge_functions'],
  },
  {
    name: 'gh',
    binary: 'cli-anything-gh',
    capabilities: ['pr', 'issue', 'run', 'workflow', 'repo', 'release'],
    taskTypes: ['repo_management', 'pr_management', 'ci_status', 'issue_tracking', 'deployment_debug'],
  },
  {
    name: 'firebase',
    binary: 'cli-anything-firebase',
    capabilities: ['deploy', 'hosting', 'functions', 'firestore', 'projects', 'emulators', 'apps'],
    taskTypes: ['deployment', 'hosting', 'auth_management', 'firestore_ops'],
  },
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function checkHarness(binary: string): Promise<{ available: boolean; version: string | null }> {
  try {
    // Use `which` to check PATH availability — execFile, no shell
    await execFile('which', [binary], { timeout: 5_000 });

    // Try to get version
    try {
      const { stdout } = await execFile(binary, ['--version'], { timeout: 10_000 });
      const version = stdout.trim().split('\n')[0] ?? null;
      return { available: true, version };
    } catch {
      return { available: true, version: null };
    }
  } catch {
    return { available: false, version: null };
  }
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  const querySecret = req.nextUrl.searchParams.get('secret');
  const provided = authHeader?.replace('Bearer ', '').trim() ?? querySecret ?? '';

  if (cronSecret && provided !== cronSecret.trim()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Missing Supabase env vars' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const available: string[] = [];
  const unavailable: string[] = [];
  let synced = 0;

  for (const harness of KNOWN_HARNESSES) {
    const { available: isAvailable, version } = await checkHarness(harness.binary);

    const { error } = await supabase
      .from('ucol_tool_registry')
      .upsert(
        {
          name: harness.name,
          binary: harness.binary,
          version: version ?? null,
          capabilities: harness.capabilities,
          task_types: harness.taskTypes,
          is_available: isAvailable,
          last_verified: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'name' }
      );

    if (error) {
      console.error(`[ToolRegistrySync] Failed to upsert ${harness.name}:`, error);
    } else {
      synced++;
      if (isAvailable) {
        available.push(`${harness.name}@${version ?? 'unknown'}`);
      } else {
        unavailable.push(harness.name);
      }
    }
  }

  console.log(
    `[ToolRegistrySync] Synced ${synced}/${KNOWN_HARNESSES.length}. ` +
    `Available: [${available.join(', ')}] | Unavailable: [${unavailable.join(', ')}]`
  );

  return NextResponse.json({
    synced,
    available,
    unavailable,
    syncedAt: new Date().toISOString(),
  });
}
