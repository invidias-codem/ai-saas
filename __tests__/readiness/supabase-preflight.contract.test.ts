import { createClient } from '@supabase/supabase-js';
import { GET } from '@/app/api/preflight/route';

jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
jest.mock('@/lib/env', () => ({
  env: {
    PREFLIGHT_SECRET: 'test-preflight-secret',
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-server-only-key',
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_fixture',
    CLERK_SECRET_KEY: 'sk_test_fixture',
    GOOGLE_API_KEY: 'test-fixture',
    LATTICE_INSTANCE_ID: undefined,
    DEPLOYMENT_MODE: 'A',
  },
}));
jest.mock('@/lib/security/auditLog', () => ({ audit: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/lib/api/license', () => ({ checkLicense: jest.fn() }));

const mockCreateClient = createClient as jest.Mock;

function clientWithError(error: { message: string } | null) {
  const limit = jest.fn().mockResolvedValue({ data: error ? null : [], error });
  mockCreateClient.mockReturnValue({
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({ limit }),
    }),
  });
  return limit;
}

function authorizedRequest() {
  return new Request('https://gen1e.xyz/api/preflight', {
    headers: { Authorization: 'Bearer test-preflight-secret' },
  });
}

describe('Supabase preflight API-key readiness', () => {
  beforeEach(() => mockCreateClient.mockReset());

  it('fails readiness when Supabase resolves with an unregistered-key error', async () => {
    const limit = clientWithError({ message: 'Unregistered API key' });
    const response = await GET(authorizedRequest());
    const json = await response.json();

    expect(limit).toHaveBeenCalledWith(1);
    expect(response.status).toBe(503);
    expect(json.db_configured).toBe(true);
    expect(json.db_reachable).toBe(false);
    expect(JSON.stringify(json)).not.toContain('test-server-only-key');
  });

  it('reports reachable only after a successful Supabase result', async () => {
    clientWithError(null);
    const response = await GET(authorizedRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.db_reachable).toBe(true);
  });

  it('requires the preflight secret before probing Supabase', async () => {
    const response = await GET(new Request('https://gen1e.xyz/api/preflight'));
    expect(response.status).toBe(401);
    expect(mockCreateClient).not.toHaveBeenCalled();
  });
});
