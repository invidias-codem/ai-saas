/**
 * lib/agents/bluesky/MentionPoller.ts
 *
 * Polls the Bluesky notification stream for new mentions and replies directed
 * at the Tech Genie account. Tracks the last processed cursor in Supabase and
 * deduplicates against previously logged interactions.
 *
 * Viral write-storm protection (guardrail #2):
 * Likes and reposts are aggregated in-memory during the poll pass into an
 * actorEngagementBatch map. Call flushActorBatch() once at the end of the
 * cron execution to write a single bulk upsert instead of one row per like.
 */

import { BskyAgent } from '@atproto/api';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { BlueskyMention, BlueskyReplyRef } from './types';

// ─── Engagement Batch Types ───────────────────────────────────────────────────

interface ActorEngagementDelta {
  handle: string;
  interactionDelta: number; // +N engagements to add
  quoteTexts: string[];      // any quote post texts to add
}

type ActorBatch = Map<string, ActorEngagementDelta>;

// ─── Constants ────────────────────────────────────────────────────────────────

const POLL_STATE_KEY = 'last_cursor';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatError(err: unknown) {
  return err instanceof Error ? { message: err.message, stack: err.stack } : err;
}

function getSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      '[MentionPoller] Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY'
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

// ─── MentionPoller ────────────────────────────────────────────────────────────

export class MentionPoller {
  private agent: BskyAgent;
  private supabase: SupabaseClient;
  private handle: string;
  private appPassword: string;
  private authenticated = false;

  // In-memory batch — populated during poll(), flushed once at end of cron run
  private actorBatch: ActorBatch = new Map();

  constructor() {
    const handle = process.env.BLUESKY_HANDLE;
    const appPassword = process.env.BLUESKY_APP_PASSWORD;

    if (!handle || !appPassword) {
      throw new Error(
        '[MentionPoller] Missing env vars: BLUESKY_HANDLE and/or BLUESKY_APP_PASSWORD'
      );
    }

    this.handle = handle;
    this.appPassword = appPassword;
    this.agent = new BskyAgent({ service: 'https://bsky.social' });
    this.supabase = getSupabaseClient();
  }

  // ─── Auth ────────────────────────────────────────────────────────────────

  private async ensureAuth(): Promise<void> {
    if (this.authenticated) return;

    await this.agent.login({
      identifier: this.handle,
      password: this.appPassword,
    });

    this.authenticated = true;
    console.log(JSON.stringify({ event: 'mention_poller_authenticated', handle: this.handle }));
  }

  // ─── Cursor State ────────────────────────────────────────────────────────

  private async getLastCursor(runId?: string): Promise<string | undefined> {
    const { data, error } = await this.supabase
      .from('bluesky_poll_state')
      .select('value')
      .eq('key', POLL_STATE_KEY)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = row not found, which is expected on first run
      console.error(JSON.stringify({ runId, event: 'poller_db_read_cursor_error', error: formatError(error) }));
    }

    return data?.value ?? undefined;
  }

  public async saveLastCursor(cursor: string, runId?: string): Promise<void> {
    const { error } = await this.supabase
      .from('bluesky_poll_state')
      .upsert(
        { key: POLL_STATE_KEY, value: cursor, updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      );

    if (error) {
      console.error(JSON.stringify({ runId, event: 'poller_db_save_cursor_error', error: formatError(error) }));
    }
  }

  // ─── Deduplication ───────────────────────────────────────────────────────

  private async getAlreadyProcessedUris(runId?: string): Promise<Set<string>> {
    const { data, error } = await this.supabase
      .from('bluesky_interactions')
      .select('mention_uri');

    if (error) {
      console.error(JSON.stringify({ runId, event: 'poller_db_fetch_uris_error', error: formatError(error) }));
      return new Set();
    }

    return new Set((data ?? []).map((row: { mention_uri: string }) => row.mention_uri));
  }

  // ─── Poll ────────────────────────────────────────────────────────────────

  /**
   * Fetches unprocessed mentions from Bluesky notifications.
   * Filters to `mention` and `reply` notification reasons only.
   * Deduplicates against previously logged interactions.
   */
  async poll(runId?: string): Promise<{ mentions: BlueskyMention[], newCursor?: string }> {
    await this.ensureAuth();

    const lastCursor = await this.getLastCursor(runId);
    const processedUris = await this.getAlreadyProcessedUris(runId);

    console.log(JSON.stringify({
      runId,
      event: 'mention_poller_start',
      cursorIn: lastCursor ?? 'none',
      alreadyProcessedCount: processedUris.size
    }));

    let newCursor: string | undefined;
    const mentions: BlueskyMention[] = [];

    try {
      const response = await this.agent.listNotifications({
        limit: 50,
        cursor: lastCursor,
      });

      newCursor = response.data.cursor;
      const notifications = response.data.notifications;

      console.log(JSON.stringify({ runId, event: 'mention_poller_received', count: notifications.length }));

      for (const notif of notifications) {
        // ── Batch-aggregate likes and reposts (guardrail: no per-notification DB writes) ──
        if (notif.reason === 'like' || notif.reason === 'repost') {
          const did = notif.author.did;
          const existing = this.actorBatch.get(did) ?? {
            handle: notif.author.handle,
            interactionDelta: 0,
            quoteTexts: [],
          };
          existing.interactionDelta += 1;
          this.actorBatch.set(did, existing);
          continue;
        }

        // ── Batch-aggregate quote posts (index their text for topic awareness) ──
        if (notif.reason === 'quote') {
          const record = notif.record as Record<string, unknown>;
          const text = typeof record?.['text'] === 'string' ? record['text'] : '';
          const did = notif.author.did;
          const existing = this.actorBatch.get(did) ?? {
            handle: notif.author.handle,
            interactionDelta: 0,
            quoteTexts: [],
          };
          existing.interactionDelta += 1;
          if (text) existing.quoteTexts.push(text);
          this.actorBatch.set(did, existing);
          continue;
        }

        // Only process mentions and replies for full engagement pipeline
        if (notif.reason !== 'mention' && notif.reason !== 'reply') continue;

        // Ensure the post record exists and has text
        const record = notif.record as Record<string, unknown>;
        if (!record || typeof record['text'] !== 'string') continue;

        const uri = notif.uri;

        // Skip if already processed
        if (processedUris.has(uri)) continue;

        // Extract reply ref if present
        let replyRef: BlueskyReplyRef | undefined;
        const replyField = record['reply'] as Record<string, unknown> | undefined;
        if (replyField) {
          const root = replyField['root'] as { uri: string; cid: string } | undefined;
          const parent = replyField['parent'] as { uri: string; cid: string } | undefined;

          if (root && parent) {
            replyRef = {
              root: { uri: root.uri, cid: root.cid },
              parent: { uri: parent.uri, cid: parent.cid },
            };
          }
        }

        mentions.push({
          uri,
          cid: notif.cid,
          authorHandle: notif.author.handle,
          authorDid: notif.author.did,
          text: record['text'] as string,
          replyRef,
          indexedAt: notif.indexedAt,
        });
      }
    } catch (err) {
      console.error(JSON.stringify({ runId, event: 'mention_poller_error', error: formatError(err) }));
      throw err;
    }

    console.log(JSON.stringify({
      runId,
      event: 'mention_poller_complete',
      mentionsFound: mentions.length,
      cursorOut: newCursor ?? 'none'
    }));

    return { mentions, newCursor };
  }

  // ─── Flush Actor Batch ──────────────────────────────────────────────────────

  /**
   * Bulk-upserts all aggregated like/repost/quote engagement deltas from this
   * poll run into bluesky_actor_memory. Call this ONCE at the end of the cron
   * handler after all mentions have been processed.
   *
   * This is the viral write-storm fix: no matter how many likes arrive in one
   * cron tick, we make exactly one upsert per unique actor — not one per like.
   */
  async flushActorBatch(runId?: string): Promise<{ flushed: number }> {
    if (this.actorBatch.size === 0) return { flushed: 0 };

    const now = new Date().toISOString();
    let flushed = 0;

    for (const [did, delta] of this.actorBatch.entries()) {
      try {
        // Fetch current record to merge
        const { data: current } = await this.supabase
          .from('bluesky_actor_memory')
          .select('engagement_count, topics_engaged, notes')
          .eq('actor_did', did)
          .maybeSingle();

        const existingCount = (current?.engagement_count ?? 0) as number;
        const existingTopics = Array.isArray(current?.topics_engaged) ? current.topics_engaged as string[] : [];

        // Merge quote texts into notes for superfan topic awareness
        const existingNotes = (current?.notes ?? {}) as Record<string, unknown>;
        if (delta.quoteTexts.length > 0) {
          const prevQuotes = Array.isArray(existingNotes['quote_samples']) ? existingNotes['quote_samples'] as string[] : [];
          existingNotes['quote_samples'] = [...prevQuotes, ...delta.quoteTexts].slice(-10); // keep last 10
        }

        const { error } = await this.supabase
          .from('bluesky_actor_memory')
          .upsert(
            {
              actor_did: did,
              handle: delta.handle,
              first_seen_at: current ? undefined : now,
              last_interaction_at: now,
              engagement_count: existingCount + delta.interactionDelta,
              topics_engaged: existingTopics,
              notes: existingNotes,
              updated_at: now,
            },
            { onConflict: 'actor_did' }
          );

        if (error) {
          console.error(JSON.stringify({ runId, event: 'poller_flush_batch_error', did, error: { message: error.message } }));
        } else {
          flushed++;
        }
      } catch (err) {
        console.warn(JSON.stringify({ runId, event: 'poller_flush_batch_actor_error', did, error: err instanceof Error ? err.message : err }));
      }
    }

    console.log(JSON.stringify({ runId, event: 'poller_flush_batch_complete', flushed, totalActors: this.actorBatch.size }));
    this.actorBatch.clear();
    return { flushed };
  }
}
