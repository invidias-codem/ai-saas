import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import { buildUserProfile } from '@/lib/agents/profileBuilder';

/**
 * Background User Profile Builder Cron Job
 * 
 * This endpoint processes users with recent activity and builds/updates their profiles
 * using conversation history analysis. Designed to be called by a cron service.
 */
export async function POST(request: NextRequest) {
  try {
    console.log('[ProfileBuilder Cron] Starting profile building job');

    // Optional: Add auth check for cron services
    const authHeader = request.headers.get('authorization');
    const expectedAuth = process.env.CRON_SECRET; // Set this in your environment
    
    if (expectedAuth && authHeader !== `Bearer ${expectedAuth}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get users with recent conversations (last 7 days) who haven't had profiles updated recently
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    // Find users with recent conversation activity
    const { data: activeUsers, error: usersError } = await supabase
      .from('conversations')
      .select('user_id')
      .gte('created_at', sevenDaysAgo.toISOString())
      .order('created_at', { ascending: false });

    if (usersError) {
      console.error('[ProfileBuilder Cron] Error fetching active users:', usersError);
      return NextResponse.json(
        { error: 'Failed to fetch active users' },
        { status: 500 }
      );
    }

    if (!activeUsers || activeUsers.length === 0) {
      console.log('[ProfileBuilder Cron] No active users found');
      return NextResponse.json({
        message: 'No active users found',
        processed: 0,
        updated: 0
      });
    }

    // Get unique user IDs
    const uniqueUserIds = [...new Set(activeUsers.map(u => u.user_id))];
    console.log(`[ProfileBuilder Cron] Found ${uniqueUserIds.length} unique active users`);

    // Filter out users whose profiles were updated recently (last 3 days)
    const { data: recentProfiles, error: profilesError } = await supabase
      .from('user_profiles')
      .select('user_id')
      .in('user_id', uniqueUserIds)
      .gte('updated_at', threeDaysAgo.toISOString());

    if (profilesError) {
      console.error('[ProfileBuilder Cron] Error checking recent profiles:', profilesError);
      // Continue anyway, don't fail the job
    }

    const recentlyUpdatedUsers = new Set(
      (recentProfiles || []).map((p: any) => p.user_id)
    );

    const usersToProcess = uniqueUserIds.filter(
      userId => !recentlyUpdatedUsers.has(userId)
    );

    console.log(`[ProfileBuilder Cron] Processing ${usersToProcess.length} users (${recentlyUpdatedUsers.size} skipped due to recent updates)`);

    let successCount = 0;
    let errorCount = 0;
    const results = [];

    // Process users in batches to avoid overwhelming the system
    const BATCH_SIZE = 5;
    for (let i = 0; i < usersToProcess.length; i += BATCH_SIZE) {
      const batch = usersToProcess.slice(i, i + BATCH_SIZE);
      
      const batchPromises = batch.map(async (userId) => {
        try {
          // Use nuanced generation for every 5th user to test Claude integration
          const useNuancedGeneration = (successCount + errorCount) % 5 === 0;
          
          const result = await buildUserProfile(userId, { useNuancedGeneration });
          if (result.success) {
            successCount++;
            return { userId, success: true, profile: result.profile, method: useNuancedGeneration ? 'claude' : 'gemini' };
          } else {
            errorCount++;
            return { userId, success: false, error: 'Profile building failed' };
          }
        } catch (error) {
          errorCount++;
          console.error(`[ProfileBuilder Cron] Error processing user ${userId}:`, error);
          return { userId, success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
      });

      const batchResults = await Promise.allSettled(batchPromises);
      results.push(...batchResults.map(r => 
        r.status === 'fulfilled' ? r.value : { success: false, error: 'Promise rejected' }
      ));

      // Small delay between batches to be nice to the API
      if (i + BATCH_SIZE < usersToProcess.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log(`[ProfileBuilder Cron] Completed. Success: ${successCount}, Errors: ${errorCount}`);

    return NextResponse.json({
      message: 'Profile building job completed',
      totalUsers: uniqueUserIds.length,
      processed: usersToProcess.length,
      skipped: recentlyUpdatedUsers.size,
      updated: successCount,
      errors: errorCount,
      details: results.slice(0, 10) // Return first 10 results for debugging
    });

  } catch (error) {
    console.error('[ProfileBuilder Cron] Fatal error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * Manual trigger endpoint (GET request for testing)
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const userId = url.searchParams.get('userId');
  const force = url.searchParams.get('force') === 'true';
  const nuanced = url.searchParams.get('nuanced') === 'true';

  if (!userId) {
    return NextResponse.json(
      { error: 'userId parameter is required for manual profile building' },
      { status: 400 }
    );
  }

  try {
    console.log(`[ProfileBuilder Manual] Building profile for user ${userId}`);
    
    // Check if profile was recently updated (unless forced)
    if (!force) {
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

      const { data: existingProfile } = await supabase
        .from('user_profiles')
        .select('updated_at')
        .eq('user_id', userId)
        .single();

      if (existingProfile && new Date(existingProfile.updated_at) > threeDaysAgo) {
        return NextResponse.json({
          message: 'Profile was recently updated. Use ?force=true to rebuild anyway.',
          lastUpdated: existingProfile.updated_at
        });
      }
    }

    const result = await buildUserProfile(userId, { useNuancedGeneration: nuanced });
    
    if (result.success) {
      return NextResponse.json({
        message: 'Profile updated successfully',
        method: nuanced ? 'claude-nuanced' : 'gemini-fast',
        profile: result.profile
      });
    } else {
      return NextResponse.json(
        { error: 'Failed to build profile' },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('[ProfileBuilder Manual] Error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}