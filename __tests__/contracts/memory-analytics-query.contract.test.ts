import { GET } from '@/app/api/memory/analytics/route';

jest.mock('@/lib/security/apiAuth', () => ({
  requireAuth: jest.fn().mockResolvedValue({ userId: 'analytics-owner' }),
  getClientIP: () => '127.0.0.1',
}));
jest.mock('@/lib/security/rateLimit', () => ({
  limitApiEndpoint: jest.fn().mockResolvedValue({ success: true }),
}));
const profile = { select: jest.fn(), eq: jest.fn(), single: jest.fn() };
const memories = { select: jest.fn(), eq: jest.fn(), order: jest.fn() };
const from = jest.fn();
jest.mock('@/lib/supabaseClient', () => ({ supabase: { from: (...args: unknown[]) => from(...args) } }));

beforeEach(() => {
  jest.clearAllMocks();
  profile.select.mockReturnValue(profile);
  profile.eq.mockReturnValue(profile);
  profile.single.mockResolvedValue({ data: { memory_count: 1 }, error: null });
  memories.select.mockReturnValue(memories);
  memories.eq.mockReturnValue(memories);
  memories.order.mockResolvedValue({ data: [{
    id: 'fact-1', content: 'Test memory', type: 'preference', scope: 'persistent',
    confidence: '0.8', extracted_at: '2026-11-01T00:00:00Z', expires_at: null,
  }], error: null });
  from.mockImplementation((table: string) => table === 'user_profiles' ? profile : memories);
});

describe('memory analytics query', () => {
  test('returns the existing analytics shape without fetching embeddings or metadata', async () => {
    const response = await GET(new Request('http://localhost/api/memory/analytics'));
    expect(response.status).toBe(200);
    expect(memories.select).toHaveBeenCalledWith('id,content,type,scope,confidence,extracted_at,expires_at');
    expect(profile.eq).toHaveBeenCalledWith('user_id', 'analytics-owner');
    expect(memories.eq).toHaveBeenCalledWith('user_id', 'analytics-owner');
    expect(memories.order).toHaveBeenCalledWith('extracted_at', { ascending: false });
    expect(await response.json()).toMatchObject({
      totalFacts: 1, averageConfidence: 0.8, factsByType: { preference: 1 },
      factsByScope: { persistent: 1 }, expiringFactsCount: 0,
      facts: [{ id: 'fact-1', content: 'Test memory', confidence: 0.8 }],
    });
  });

  test('does not query memory rows when the profile has no memories', async () => {
    profile.single.mockResolvedValue({ data: { memory_count: 0 }, error: null });
    const response = await GET(new Request('http://localhost/api/memory/analytics'));
    expect(await response.json()).toMatchObject({ totalFacts: 0, facts: [] });
    expect(from).not.toHaveBeenCalledWith('memory_bank');
  });

  test('keeps database failures visible rather than returning successful empty analytics', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      memories.order.mockResolvedValue({ data: null, error: { code: '57014' } });
      const response = await GET(new Request('http://localhost/api/memory/analytics'));
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: 'Failed to fetch memories' });
    } finally { log.mockRestore(); }
  });
});
