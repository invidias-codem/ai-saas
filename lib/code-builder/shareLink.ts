/**
 * Phase 8D: stable, Lattice-controlled share links for sandbox previews.
 *
 * Share links are the ONLY way to access a preview. The raw sandbox URL is
 * never handed out — consumers receive a share token that resolves through
 * an authorization-checked route.
 *
 * Trust boundary:
 * - Share tokens are unguessable (crypto.randomUUID).
 * - Every resolution checks Clerk auth + preview ownership.
 * - Until Issue #479 enforcement exists, do NOT label links "private" or
 *   "revocable".
 *
 * Server-only module.
 */
import { supabaseAdmin } from '@/lib/supabaseClient';

function assertSupabase() {
  if (!supabaseAdmin) {
    throw new Error('[shareLink] supabaseAdmin not configured');
  }
  return supabaseAdmin!;
}

export interface ShareLink {
  readonly id: string;
  readonly preview_id: string;
  readonly user_id: string;
  readonly share_token: string;
  readonly created_at: string;
}

export interface ResolvedShare {
  readonly previewId: string;
  readonly sandboxUrl: string;
  readonly ownerId: string;
}

/**
 * Create (or rotate) a share link for a preview. Only the preview owner can
 * create a share link. Returns the share token.
 */
export async function createShareLink(
  previewId: string,
  userId: string
): Promise<ShareLink> {
  const sb = assertSupabase();

  // Verify preview ownership.
  const { data: preview, error: previewError } = await sb
    .from('preview_sandboxes')
    .select('id, user_id, status, sandbox_url')
    .eq('id', previewId)
    .maybeSingle();

  if (previewError) throw new Error(`[shareLink] preview lookup failed: ${previewError.message}`);
  if (!preview) throw new Error(`[shareLink] preview not found: ${previewId}`);
  if (preview.user_id !== userId) {
    throw new Error(`[shareLink] preview ownership mismatch`);
  }
  if (preview.status !== 'ready') {
    throw new Error(`[shareLink] preview not ready: ${preview.status}`);
  }
  if (!preview.sandbox_url) {
    throw new Error(`[shareLink] preview has no sandbox URL`);
  }

  // Upsert: one share per preview. Rotate the token on re-share.
  const shareToken = crypto.randomUUID();
  const { data, error } = await sb
    .from('preview_shares')
    .upsert(
      {
        preview_id: previewId,
        user_id: userId,
        share_token: shareToken,
      },
      { onConflict: 'preview_id' }
    )
    .select()
    .single();

  if (error) throw new Error(`[shareLink] share creation failed: ${error.message}`);
  if (!data) throw new Error(`[shareLink] share creation returned no data`);

  return {
    id: data.id,
    preview_id: data.preview_id,
    user_id: data.user_id,
    share_token: data.share_token,
    created_at: data.created_at,
  };
}

/**
 * Resolve a share token to the preview's sandbox URL. Checks that the
 * requesting user owns the preview. Returns null if the token is invalid.
 */
export async function resolveShareLink(
  shareToken: string,
  userId: string
): Promise<ResolvedShare | null> {
  const sb = assertSupabase();

  const { data: share, error } = await sb
    .from('preview_shares')
    .select('id, preview_id, user_id, share_token')
    .eq('share_token', shareToken)
    .maybeSingle();

  if (error) throw new Error(`[shareLink] share lookup failed: ${error.message}`);
  if (!share) return null;

  // Verify the requesting user owns the preview.
  const { data: preview, error: previewError } = await sb
    .from('preview_sandboxes')
    .select('id, user_id, sandbox_url, status')
    .eq('id', share.preview_id)
    .maybeSingle();

  if (previewError) throw new Error(`[shareLink] preview lookup failed: ${previewError.message}`);
  if (!preview) return null;
  if (preview.user_id !== userId) return null;
  if (preview.status !== 'ready' || !preview.sandbox_url) return null;

  return {
    previewId: preview.id,
    sandboxUrl: preview.sandbox_url,
    ownerId: preview.user_id,
  };
}

/**
 * Get the existing share link for a preview (owner-only). Returns null if
 * no share link exists.
 */
export async function getShareLinkForPreview(
  previewId: string,
  userId: string
): Promise<ShareLink | null> {
  const sb = assertSupabase();

  const { data: preview, error: previewError } = await sb
    .from('preview_sandboxes')
    .select('user_id')
    .eq('id', previewId)
    .maybeSingle();

  if (previewError) throw new Error(`[shareLink] preview lookup failed: ${previewError.message}`);
  if (!preview) return null;
  if (preview.user_id !== userId) return null;

  const { data: share, error } = await sb
    .from('preview_shares')
    .select('id, preview_id, user_id, share_token, created_at')
    .eq('preview_id', previewId)
    .maybeSingle();

  if (error) throw new Error(`[shareLink] share lookup failed: ${error.message}`);
  if (!share) return null;

  return {
    id: share.id,
    preview_id: share.preview_id,
    user_id: share.user_id,
    share_token: share.share_token,
    created_at: share.created_at,
  };
}
