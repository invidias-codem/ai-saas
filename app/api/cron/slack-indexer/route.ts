/**
 * Slack Channel Indexer - Cron Endpoint
 * 
 * Called by a scheduler to auto-index opted-in Slack channels.
 * Vercel Hobby only allows daily cron schedules; use an external scheduler for
 * higher-frequency indexing if needed.
 * Secured with CRON_SECRET environment variable.
 */

import { NextRequest, NextResponse } from 'next/server';
import { indexAllWorkspaces } from '@/lib/slack/channelIndexer';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes max

export async function POST(request: NextRequest) {
  try {
    // Verify this is a legitimate cron call
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      console.error('[Cron] CRON_SECRET not configured');
      return NextResponse.json(
        { error: 'Cron not configured' },
        { status: 500 }
      );
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      console.error('[Cron] Unauthorized cron call');
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    console.log('[Cron] Starting Slack channel indexer run');
    const startTime = Date.now();

    // Run the indexer for all workspaces
    await indexAllWorkspaces();

    const duration = Date.now() - startTime;
    console.log(`[Cron] Indexer completed in ${duration}ms`);

    return NextResponse.json({
      success: true,
      duration_ms: duration,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[Cron] Indexer failed:', error);
    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}
