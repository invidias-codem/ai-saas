jest.mock('@/lib/security/apiAuth', () => ({
  requireAuth: jest.fn(),
  handleAuthError: jest.fn().mockReturnValue(null),
}));
jest.mock('@/lib/ucol/continuity/runStore', () => ({
  listOwnerConversationRuns: jest.fn(),
}));

import { requireAuth } from '@/lib/security/apiAuth';
import { listOwnerConversationRuns } from '@/lib/ucol/continuity/runStore';
import { GET } from '@/app/api/conversations/[id]/runs/route';

const conversationId = '00000000-0000-4000-8000-000000000001';
const args = { params: Promise.resolve({ id: conversationId }) };
const original = process.env.ENABLE_CONVERSATION_CONTINUITY;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.ENABLE_CONVERSATION_CONTINUITY = 'true';
  (requireAuth as jest.Mock).mockResolvedValue({ userId: 'user-a' });
});
afterAll(() => {
  if (original === undefined) delete process.env.ENABLE_CONVERSATION_CONTINUITY;
  else process.env.ENABLE_CONVERSATION_CONTINUITY = original;
});

describe('conversation run listing is gated and owner-scoped', () => {
  it('keeps default-off rollout disabled without a worker', async () => {
    delete process.env.ENABLE_CONVERSATION_CONTINUITY;
    const response = await GET(new Request('https://lattice.example/api/conversations/runs'), args);
    expect(response.status).toBe(404);
    expect(requireAuth).not.toHaveBeenCalled();
    expect(listOwnerConversationRuns).not.toHaveBeenCalled();
  });
  it('rejects malformed conversation identifiers before database reads', async () => {
    const response = await GET(new Request('https://lattice.example'), {
      params: Promise.resolve({ id: 'other-user' }),
    });
    expect(response.status).toBe(404);
    expect(listOwnerConversationRuns).not.toHaveBeenCalled();
  });
  it('does not reveal existence of another user\'s conversation', async () => {
    (listOwnerConversationRuns as jest.Mock).mockResolvedValue(null);
    const response = await GET(new Request('https://lattice.example'), args);
    expect(response.status).toBe(404);
    expect(listOwnerConversationRuns).toHaveBeenCalledWith(conversationId, 'user-a');
  });
  it('returns only authorized run metadata without caching', async () => {
    (listOwnerConversationRuns as jest.Mock).mockResolvedValue([{
      id: 'run-a', status: 'running', phase: 'generation',
    }]);
    const response = await GET(new Request('https://lattice.example'), args);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect((await response.json()).runs[0].id).toBe('run-a');
  });
  it('reports a persistence outage as unavailable, not empty history', async () => {
    (listOwnerConversationRuns as jest.Mock).mockRejectedValue(new Error('database outage'));
    const response = await GET(new Request('https://lattice.example'), args);
    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain('unavailable');
  });
});
