import {
  createShareLink,
  resolveShareLink,
  getShareLinkForPreview,
} from '@/lib/code-builder/shareLink';

// ─── Mocks ─────────────────────────────────────────────────────────────────

jest.mock('@/lib/supabaseClient', () => {
  const mockQB = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn(),
    upsert: jest.fn().mockReturnThis(),
    single: jest.fn().mockReturnThis(),
  };
  return {
    supabaseAdmin: {
      from: jest.fn().mockReturnValue(mockQB),
      insert: jest.fn().mockReturnValue(mockQB),
      update: jest.fn().mockReturnValue(mockQB),
    },
  };
});

// ─── Imports (after mocks) ────────────────────────────────────────────────

import { supabaseAdmin } from '@/lib/supabaseClient';

const mockFrom = supabaseAdmin.from as jest.Mock;

let mockQB: {
  select: jest.Mock;
  eq: jest.Mock;
  maybeSingle: jest.Mock;
  upsert: jest.Mock;
  single: jest.Mock;
};

function initMockQB() {
  (mockFrom as jest.Mock)();
  mockQB = (mockFrom as jest.Mock).mock.results[0]?.value as {
    select: jest.Mock;
    eq: jest.Mock;
    maybeSingle: jest.Mock;
    upsert: jest.Mock;
    single: jest.Mock;
  };
}

initMockQB();

const previewId = '00000000-0000-4000-8000-000000000001';
const userId = 'user_123';
const shareToken = 'share_token_abc123';

const mockReadyPreview = {
  id: previewId,
  user_id: userId,
  status: 'ready',
  sandbox_url: 'https://preview-xyz.vercel-sandbox.com',
};

// Call-count-based mock implementation for maybeSingle and single.
// Each test sets up arrays of {data, error} results that are returned in order.
let maybeSingleResults: { data: unknown; error: unknown }[] = [];
let maybeSingleCallCount = 0;
let singleResults: { data: unknown; error: unknown }[] = [];
let singleCallCount = 0;

function setMaybeSingleResults(results: { data: unknown; error: unknown }[]) {
  maybeSingleResults = results;
  maybeSingleCallCount = 0;
  mockQB.maybeSingle.mockImplementation(async () => {
    const result = maybeSingleResults[maybeSingleCallCount++];
    return result ?? { data: null, error: null };
  });
}

function setSingleResults(results: { data: unknown; error: unknown }[]) {
  singleResults = results;
  singleCallCount = 0;
  mockQB.single.mockImplementation(async () => {
    const result = singleResults[singleCallCount++];
    return result ?? { data: null, error: null };
  });
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('code builder share links (Phase 8D)', () => {
  beforeEach(() => {
    initMockQB();
    mockQB.select.mockReturnThis();
    mockQB.eq.mockReturnThis();
    mockQB.upsert.mockReturnThis();
    mockQB.single.mockReturnThis();
    setMaybeSingleResults([]);
    setSingleResults([]);
  });

  it('creates a share link for a ready preview owned by the user', async () => {
    setMaybeSingleResults([
      { data: mockReadyPreview, error: null }, // preview lookup
    ]);
    setSingleResults([
      { data: { id: 'share_1', preview_id: previewId, user_id: userId, share_token: shareToken, created_at: new Date().toISOString() }, error: null }, // upsert.single()
    ]);

    const share = await createShareLink(previewId, userId);

    expect(share.share_token).toBe(shareToken);
    expect(share.preview_id).toBe(previewId);
    expect(share.user_id).toBe(userId);
  });

  it('throws when preview is not ready', async () => {
    setMaybeSingleResults([
      { data: { ...mockReadyPreview, status: 'provisioning' }, error: null },
    ]);

    await expect(createShareLink(previewId, userId)).rejects.toThrow(
      'not ready'
    );
  });

  it('throws on preview ownership mismatch', async () => {
    setMaybeSingleResults([
      { data: { ...mockReadyPreview, user_id: 'other_user' }, error: null },
    ]);

    await expect(createShareLink(previewId, userId)).rejects.toThrow(
      'ownership mismatch'
    );
  });

  it('throws when preview has no sandbox URL', async () => {
    setMaybeSingleResults([
      { data: { ...mockReadyPreview, sandbox_url: null }, error: null },
    ]);

    await expect(createShareLink(previewId, userId)).rejects.toThrow(
      'no sandbox URL'
    );
  });

  it('resolves a valid share token for the owner', async () => {
    // resolveShareLink calls maybeSingle for share FIRST, then preview.
    setMaybeSingleResults([
      { data: { id: 'share_1', preview_id: previewId, user_id: userId, share_token: shareToken }, error: null }, // share lookup
      { data: mockReadyPreview, error: null }, // preview lookup
    ]);

    const resolved = await resolveShareLink(shareToken, userId);

    expect(resolved).not.toBeNull();
    expect(resolved!.previewId).toBe(previewId);
    expect(resolved!.sandboxUrl).toBe('https://preview-xyz.vercel-sandbox.com');
    expect(resolved!.ownerId).toBe(userId);
  });

  it('returns null for an invalid share token', async () => {
    setMaybeSingleResults([
      { data: null, error: null }, // share lookup returns null
    ]);

    const resolved = await resolveShareLink('invalid_token', userId);
    expect(resolved).toBeNull();
  });

  it('returns null when share token belongs to another user', async () => {
    setMaybeSingleResults([
      { data: { id: 'share_1', preview_id: previewId, user_id: 'other_user', share_token: shareToken }, error: null }, // share lookup
    ]);

    const resolved = await resolveShareLink(shareToken, userId);
    expect(resolved).toBeNull();
  });

  it('returns null when preview is not ready', async () => {
    setMaybeSingleResults([
      { data: { id: 'share_1', preview_id: previewId, user_id: userId, share_token: shareToken }, error: null }, // share lookup
      { data: { ...mockReadyPreview, status: 'failed' }, error: null }, // preview lookup
    ]);

    const resolved = await resolveShareLink(shareToken, userId);
    expect(resolved).toBeNull();
  });

  it('getShareLinkForPreview returns the existing share link', async () => {
    setMaybeSingleResults([
      { data: mockReadyPreview, error: null }, // preview lookup (ownership check)
      { data: { id: 'share_1', preview_id: previewId, user_id: userId, share_token: shareToken, created_at: new Date().toISOString() }, error: null }, // share lookup
    ]);

    const share = await getShareLinkForPreview(previewId, userId);

    expect(share).not.toBeNull();
    expect(share!.share_token).toBe(shareToken);
  });

  it('getShareLinkForPreview returns null on ownership mismatch', async () => {
    setMaybeSingleResults([
      { data: { ...mockReadyPreview, user_id: 'other_user' }, error: null }, // preview lookup
    ]);

    const share = await getShareLinkForPreview(previewId, userId);
    expect(share).toBeNull();
  });

  it('getShareLinkForPreview returns null when no share exists', async () => {
    setMaybeSingleResults([
      { data: mockReadyPreview, error: null }, // preview lookup
      { data: null, error: null }, // share lookup returns null
    ]);

    const share = await getShareLinkForPreview(previewId, userId);
    expect(share).toBeNull();
  });
});
