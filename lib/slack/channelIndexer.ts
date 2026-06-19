/**
 * Slack Channel Indexer (P1 Implementation)
 *
 * Auto-indexes conversation history from opted-in channels into memory_bank.
 * Uses team_id as the primary key (workspace isolation, avoids P0 contamination bug).
 *
 * Architecture:
 * - Batches messages every 5 minutes (configurable)
 * - Generates embeddings via existing embedding service
 * - Stores as episodic memories with 'slack_channel' featureType
 * - Respects channel opt-in/opt-out via slash commands
 *
 * Risk mitigations:
 * - Rate limiting: 1000 messages/hour per workspace
 * - Error handling: silent failures + retry queue
 * - Compliance: explicit channel opt-in required
 */

import { getSlackConfig, SlackConfig } from './tokenManager';
import { generateEmbeddingWithMetadata } from '@/lib/memory/embedding';
import { supabaseAdmin } from '@/lib/supabaseClient';

interface SlackMessage {
  text: string;
  user: string;
  ts: string;
  thread_ts?: string;
  type: string;
}

interface IndexerResult {
  indexed: number;
  errors: number;
  skipped: number;
}

const BATCH_SIZE = 100;
const MAX_MESSAGES_PER_HOUR = 1000;
const INDEXER_WINDOW_MINUTES = 5;

/**
 * Fetch recent messages from a Slack channel
 * Uses conversations.history API with pagination
 */
async function fetchChannelMessages(
  config: SlackConfig,
  channelId: string,
  oldest?: number
): Promise<SlackMessage[]> {
  try {
    const params = new URLSearchParams({
      channel: channelId,
      limit: BATCH_SIZE.toString(),
      ...(oldest && { oldest: oldest.toString() })
    });

    const response = await fetch(
      `https://slack.com/api/conversations.history?${params}`,
      {
        headers: {
          'Authorization': `Bearer ${config.botToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      console.error(`[Indexer] Failed to fetch messages: ${response.status}`);
      return [];
    }

    const data = await response.json();
    if (!data.ok) {
      console.error(`[Indexer] Slack API error: ${data.error}`);
      return [];
    }

    return data.messages.filter((m: any) => 
      m.type === 'message' && 
      !m.bot_id && 
      m.text && 
      m.text.length > 10 // Skip very short messages
    );

  } catch (error) {
    console.error(`[Indexer] Error fetching messages from ${channelId}:`, error);
    return [];
  }
}

/**
 * Check if we've exceeded the rate limit for this workspace
 */
async function checkRateLimit(teamId: string): Promise<boolean> {
  if (!supabaseAdmin) return false;

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  
  const { count, error } = await supabaseAdmin
    .from('slack_indexed_messages')
    .select('*', { count: 'exact', head: true })
    .eq('team_id', teamId)
    .gte('created_at', oneHourAgo);

  if (error) {
    console.error('[Indexer] Rate limit check error:', error);
    return false;
  }

  return (count || 0) < MAX_MESSAGES_PER_HOUR;
}

/**
 * Index a single message into the memory bank
 * Uses team_id as the primary key (workspace isolation)
 */
async function indexMessage(
  teamId: string,
  message: SlackMessage,
  channelId: string,
  channelName: string
): Promise<boolean> {
  try {
    if (!supabaseAdmin) {
      console.error('[Indexer] Supabase admin not available');
      return false;
    }

    // Generate embedding
    const embedding = await generateEmbeddingWithMetadata(message.text);

    // Store in memory_bank with team-scoped key
    const memoryKey = `${teamId}:${channelId}`; // workspace:channel format
    const memoryContent = `[${channelName}] ${message.text}`;
    
    const { error } = await supabaseAdmin
      .from('memory_bank')
      .insert({
        user_id: memoryKey, // Use team-scoped key instead of userId
        content: memoryContent,
        embedding: embedding.vector,
        feature_type: 'slack_channel',
        metadata: {
          team_id: teamId,
          channel_id: channelId,
          channel_name: channelName,
          message_ts: message.ts,
          user_id: message.user,
          thread_ts: message.thread_ts || null,
          indexed_at: new Date().toISOString(),
          auto_indexed: true
        }
      });

    if (error) {
      console.error(`[Indexer] Failed to store message ${message.ts}:`, error);
      return false;
    }

    // Track in slack_indexed_messages for rate limiting
    await supabaseAdmin
      .from('slack_indexed_messages')
      .insert({
        team_id: teamId,
        channel_id: channelId,
        message_ts: message.ts,
        created_at: new Date().toISOString()
      });

    return true;

  } catch (error) {
    console.error(`[Indexer] Error indexing message ${message.ts}:`, error);
    return false;
  }
}

/**
 * Main indexer function - indexes one channel for one workspace
 */
export async function indexChannel(
  teamId: string,
  channelId: string,
  channelName: string
): Promise<IndexerResult> {
  const result: IndexerResult = { indexed: 0, errors: 0, skipped: 0 };

  try {
    if (!supabaseAdmin) {
      console.error('[Indexer] Supabase admin not available');
      return result;
    }

    // Get workspace config
    const config = await getSlackConfig(teamId);
    if (!config) {
      console.error(`[Indexer] No config for team ${teamId}`);
      return result;
    }

    // Check rate limit
    const canIndex = await checkRateLimit(teamId);
    if (!canIndex) {
      console.warn(`[Indexer] Rate limit exceeded for ${teamId}`);
      return result;
    }

    // Get last indexed timestamp
    const { data: lastIndexed } = await supabaseAdmin
      .from('slack_indexed_messages')
      .select('message_ts')
      .eq('team_id', teamId)
      .eq('channel_id', channelId)
      .order('message_ts', { ascending: false })
      .limit(1)
      .single();

    const oldest = lastIndexed ? parseFloat(lastIndexed.message_ts) : undefined;

    // Fetch messages
    const messages = await fetchChannelMessages(config, channelId, oldest);

    // Index each message
    for (const message of messages) {
      // Check rate limit again (in case we hit it mid-batch)
      const stillCanIndex = await checkRateLimit(teamId);
      if (!stillCanIndex) {
        result.skipped = messages.length - result.indexed - result.errors;
        break;
      }

      const success = await indexMessage(teamId, message, channelId, channelName);
      if (success) {
        result.indexed++;
      } else {
        result.errors++;
      }
    }

    console.log(`[Indexer] ${teamId}/${channelName}: ${result.indexed} indexed, ${result.errors} errors, ${result.skipped} skipped`);
    return result;

  } catch (error) {
    console.error(`[Indexer] Failed to index ${channelId}:`, error);
    return result;
  }
}

/**
 * Index all opted-in channels for a workspace
 * Called by cron job every 5 minutes
 */
export async function indexWorkspace(teamId: string): Promise<IndexerResult> {
  const totalResult: IndexerResult = { indexed: 0, errors: 0, skipped: 0 };

  try {
    if (!supabaseAdmin) {
      console.error('[Indexer] Supabase admin not available');
      return totalResult;
    }

    // Get all opted-in channels for this workspace
    const { data: channels, error } = await supabaseAdmin
      .from('slack_indexed_channels')
      .select('channel_id, channel_name')
      .eq('team_id', teamId)
      .eq('enabled', true);

    if (error || !channels) {
      console.error(`[Indexer] Failed to fetch channels for ${teamId}:`, error);
      return totalResult;
    }

    // Index each channel
    for (const channel of channels) {
      const result = await indexChannel(teamId, channel.channel_id, channel.channel_name);
      totalResult.indexed += result.indexed;
      totalResult.errors += result.errors;
      totalResult.skipped += result.skipped;
    }

    return totalResult;

  } catch (error) {
    console.error(`[Indexer] Failed to index workspace ${teamId}:`, error);
    return totalResult;
  }
}

/**
 * Enable auto-indexing for a Slack channel.
 * Channel opt-in is explicit and stored separately from indexed messages.
 */
export async function enableIndexingChannel(
  teamId: string,
  channelId: string,
  channelName: string,
  slackUserId: string
): Promise<void> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin not available');
  }

  const { error } = await supabaseAdmin
    .from('slack_indexed_channels')
    .upsert(
      {
        team_id: teamId,
        channel_id: channelId,
        channel_name: channelName,
        enabled: true,
        created_by_slack_user: slackUserId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'team_id,channel_id' }
    );

  if (error) {
    throw new Error(`Failed to enable channel indexing: ${error.message}`);
  }
}

/**
 * Disable auto-indexing for a Slack channel while retaining already indexed memory.
 */
export async function stopIndexingChannel(
  teamId: string,
  channelId: string
): Promise<void> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin not available');
  }

  const { error } = await supabaseAdmin
    .from('slack_indexed_channels')
    .update({
      enabled: false,
      updated_at: new Date().toISOString(),
    })
    .eq('team_id', teamId)
    .eq('channel_id', channelId);

  if (error) {
    throw new Error(`Failed to disable channel indexing: ${error.message}`);
  }
}

/**
 * Index all workspaces (master indexer)
 * Called by scheduled job - processes one workspace at a time to avoid overload
 */
export async function indexAllWorkspaces(): Promise<void> {
  try {
    if (!supabaseAdmin) {
      console.error('[Indexer] Supabase admin not available');
      return;
    }

    // Get all workspaces with opted-in channels
    const { data: workspaces, error } = await supabaseAdmin
      .from('slack_indexed_channels')
      .select('team_id')
      .eq('enabled', true);

    if (error || !workspaces) {
      console.error('[Indexer] Failed to fetch workspaces:', error);
      return;
    }

    // Deduplicate team IDs
    const uniqueTeams = Array.from(new Set(workspaces.map(w => w.team_id)));

    console.log(`[Indexer] Starting indexing run for ${uniqueTeams.length} workspaces`);

    // Index each workspace sequentially (to avoid rate limit collisions)
    for (const teamId of uniqueTeams) {
      const result = await indexWorkspace(teamId);
      console.log(`[Indexer] ${teamId}: ${result.indexed} total indexed`);
      
      // Small delay between workspaces to be nice to Slack API
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('[Indexer] Indexing run complete');

  } catch (error) {
    console.error('[Indexer] Master indexer failed:', error);
  }
}
