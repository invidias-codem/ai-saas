/**
 * app/api/cron/refinery/route.ts
 *
 * Vercel Cron Route — Data Refinery Engine heartbeat.
 *
 * Fetches pending jobs from workspace_refinery_jobs, locks them,
 * processes a small batch through the refinery orchestrator, and
 * updates job statuses. Protected by CRON_SECRET auth.
 */

import { NextRequest, NextResponse } from 'next/server';
import { processRefineryBatch, type RefineryJobResult } from '@/lib/refinery/orchestrator';
import { requireCronAuth } from '@/lib/security/cronAuth';
import { supabaseAdmin } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MAX_URLS_PER_BATCH = 5;

function lockJobsInDatabase(ids: bigint[] | number[]): Promise<void> {
  if (!supabaseAdmin) return Promise.resolve();
  return supabaseAdmin
    .from('workspace_refinery_jobs')
    .update({ status: 'processing', updated_at: new Date().toISOString() })
    .in('id', ids as any)
    .then(() => undefined) as Promise<void>;
}

async function updateJobStatuses(
  jobs: { id: bigint | number; origin_uri: string }[],
  results: RefineryJobResult[],
): Promise<void> {
  if (!supabaseAdmin) return;

  const resultMap = new Map(results.map((r) => [r.url, r]));

  for (const job of jobs) {
    const result = resultMap.get(job.origin_uri);
    const status = result?.status === 'success' ? 'completed' : 'failed';
    const lastError = result?.error ?? null;

    if (supabaseAdmin) {
      await supabaseAdmin.rpc('increment_refinery_job_attempts', { p_ids: [job.id] });
    }

    await supabaseAdmin
      .from('workspace_refinery_jobs')
      .update({
        status,
        last_error: lastError,
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id as any);
  }
}

export async function POST(req: NextRequest) {
  const authFailure = requireCronAuth(req, { routeName: 'RefineryCron' });
  if (authFailure) return authFailure;

  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    // 1. Fetch pending jobs
    const { data: pendingJobs, error: fetchError } = await supabaseAdmin
      .from('workspace_refinery_jobs')
      .select('id, workspace_id, user_id, origin_uri')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(MAX_URLS_PER_BATCH);

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!pendingJobs || pendingJobs.length === 0) {
      return NextResponse.json({ status: 'idle', message: 'No pending jobs' });
    }

    // 2. Mark as processing to prevent race conditions
    await lockJobsInDatabase(pendingJobs.map((j) => j.id));

    const workspaceId = pendingJobs[0].workspace_id;
    const userId = pendingJobs[0].user_id;
    const urls = pendingJobs.map((j) => j.origin_uri);

    // 3. Execute the pipeline
    const results = await processRefineryBatch(workspaceId, userId, urls);

    // 4. Update job statuses
    await updateJobStatuses(pendingJobs, results);

    return NextResponse.json({ status: 'success', results });
  } catch (error: any) {
    return NextResponse.json(
      { status: 'error', message: error?.message ?? 'Refinery cron failed' },
      { status: 500 },
    );
  }
}
