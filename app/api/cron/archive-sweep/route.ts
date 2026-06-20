import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseClient';
import { enqueueArchivalTask } from '@/lib/queue/archivalQueue';
import { requireCronAuth } from '@/lib/security/cronAuth';

export async function GET(req: Request) {
  const authFailure = requireCronAuth(req, { routeName: 'ArchiveSweepCron' });
  if (authFailure) return authFailure;

  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase admin client not initialized' }, { status: 500 });
    }

    // Determine the decay threshold for WARM documents (e.g., 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Identify stale WARM documents (batch of 10 to avoid overwhelming)
    const { data: staleDocs, error } = await supabaseAdmin
      .from('workspace_documents')
      .select('id')
      .eq('storage_state', 'WARM')
      .lt('updated_at', sevenDaysAgo.toISOString())
      .limit(10);

    if (error) throw error;
    if (!staleDocs || staleDocs.length === 0) {
      return NextResponse.json({ message: 'No stale documents found' });
    }

    const ids = staleDocs.map(d => d.id);

    // Atomically transition them to COMPRESSING so subsequent cron sweeps ignore them
    const { error: updateError } = await supabaseAdmin
      .from('workspace_documents')
      .update({ storage_state: 'COMPRESSING' })
      .in('id', ids);

    if (updateError) throw updateError;

    // Dispatch the tasks to the webhook queue
    for (const id of ids) {
      await enqueueArchivalTask(id);
    }

    return NextResponse.json({ message: `Queued ${ids.length} documents for compression` });
  } catch (err: any) {
    console.error('[ArchiveSweep] Failed:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
