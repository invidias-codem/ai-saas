jest.mock('@/lib/supabaseClient', () => ({
  supabaseAdmin: {
    from: jest.fn(),
    rpc: jest.fn(),
  },
}));

import { supabaseAdmin } from '@/lib/supabaseClient';
import {
  getConfiguredProviderKeys,
  getUserProviderApiKeys,
  maskProviderKey,
  ProviderApiKeys,
} from '../userProviderKeys';

const mockSupabaseAdmin = supabaseAdmin as unknown as {
  from: jest.Mock;
  rpc: jest.Mock;
};

  describe.skip('userProviderKeys', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('masks provider keys without exposing secret material', () => {
    expect(maskProviderKey('sk-proj-1234567890wxyz')).toBe('sk-proj...wxyz');
    expect(maskProviderKey('short')).toBe('configured');
    expect(maskProviderKey(null)).toBeNull();
  });

  it('reports configured providers from metadata only', async () => {
    mockSupabaseAdmin.from.mockReturnValueOnce({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          order: jest.fn().mockResolvedValue({
            data: [
              { provider: 'openai', secret_preview: 'sk-proj...abcd', updated_at: '2026-01-01' },
              { provider: 'anthropic', secret_preview: 'sk-ant...wxyz', updated_at: '2026-01-02' },
            ],
            error: null,
          }),
        }),
      }),
    });

    await expect(getConfiguredProviderKeys('user_123')).resolves.toEqual({
      openai: { configured: true, preview: 'sk-proj...abcd', updatedAt: '2026-01-01' },
      anthropic: { configured: true, preview: 'sk-ant...wxyz', updatedAt: '2026-01-02' },
      google: { configured: false, preview: null, updatedAt: null },
    });
  });

  it('retrieves decrypted user keys through the SECURITY DEFINER RPC', async () => {
    mockSupabaseAdmin.rpc.mockResolvedValueOnce({
      data: [
        { provider: 'openai', api_key: '***' },
        { provider: 'anthropic', api_key: 'sk-ant-user' },
        { provider: 'google', api_key: 'AIza-user' },
      ],
      error: null,
    });

    const keys: ProviderApiKeys = await getUserProviderApiKeys('user_123');

    expect(keys).toEqual({
      openai: '***',
      anthropic: 'sk-ant-user',
      google: 'AIza-user',
    });
    expect(mockSupabaseAdmin.rpc).toHaveBeenCalledWith('get_user_provider_api_keys', { p_user_id: 'user_123' });
  });
});
