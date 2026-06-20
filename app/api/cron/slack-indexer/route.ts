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
import { requireCronAuth } from '@/lib/security/cronAuth';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes max

export async function runSlackIndexerCron(request: NextRequest) {
  try {
    const authFailure = requireCronAuth(request, { routeName: 'SlackIndexerCron' });
    if (authFailure) return authFailure;

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

export async function GET(request: NextRequest) {
  return runSlackIndexerCron(request);
}

export async function POST(request: NextRequest) {
  return runSlackIndexerCron(request);
}
