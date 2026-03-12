/**
 * lib/agents/bluesky/MentionPoller.ts
 *
 * Polls the Bluesky notification stream for new mentions and replies directed
 * at the Tech Genie account. Tracks the last processed cursor in Supabase and
 * deduplicates against previously logged interactions.
 */

import { BskyAgent } from '@atproto/api';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { BlueskyMention, BlueskyReplyRef } from './types';

// ─── Constants ────────────────────────────────────────────────────────────────

const POLL_STATE_KEY = 'last_cursor';

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
    console.log(`[MentionPoller] Authenticated as ${this.handle}`);
  }

  // ─── Cursor State ────────────────────────────────────────────────────────

  private async getLastCursor(): Promise<string | undefined> {
    const { data, error } = await this.supabase
      .from('bluesky_poll_state')
      .select('value')
      .eq('key', POLL_STATE_KEY)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = row not found, which is expected on first run
      console.error('[MentionPoller] Failed to read cursor from Supabase:', error);
    }

    return data?.value ?? undefined;
  }

  private async saveLastCursor(cursor: string): Promise<void> {
    const { error } = await this.supabase
      .from('bluesky_poll_state')
      .upsert(
        { key: POLL_STATE_KEY, value: cursor, updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      );

    if (error) {
      console.error('[MentionPoller] Failed to save cursor to Supabase:', error);
    }
  }

  // ─── Deduplication ───────────────────────────────────────────────────────

  private async getAlreadyProcessedUris(): Promise<Set<string>> {
    const { data, error } = await this.supabase
      .from('bluesky_interactions')
      .select('mention_uri');

    if (error) {
      console.error('[MentionPoller] Failed to fetch processed URIs:', error);
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
  async poll(): Promise<BlueskyMention[]> {
    await this.ensureAuth();

    const lastCursor = await this.getLastCursor();
    const processedUris = await this.getAlreadyProcessedUris();

    console.log(
      `[MentionPoller] Polling notifications (cursor=${lastCursor ?? 'none'}, ` +
      `already_processed=${processedUris.size})`
    );

    let newCursor: string | undefined;
    const mentions: BlueskyMention[] = [];

    try {
      const response = await this.agent.listNotifications({
        limit: 50,
        cursor: lastCursor,
      });

      newCursor = response.data.cursor;
      const notifications = response.data.notifications;

      console.log(`[MentionPoller] Received ${notifications.length} notifications`);

      for (const notif of notifications) {
        // Only process mentions and replies
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
      console.error('[MentionPoller] Failed to fetch notifications:', err);
      throw err;
    }

    // Persist the new cursor so next run starts from here
    if (newCursor) {
      await this.saveLastCursor(newCursor);
    }

    console.log(`[MentionPoller] Found ${mentions.length} new unprocessed mentions`);
    return mentions;
  }
}
