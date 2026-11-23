/**
 * C1 protected demo UI — route-level denial tests.
 *
 * Tests the security contract of the demo API routes:
 * - Feature gate off → 404 (no feature existence leakage)
 * - Not authenticated → 401
 * - Authenticated but not owner → 403 (workspace:read is insufficient)
 * - Owner → 200 with synthetic data
 * - Missing workspaceId → 400
 * - No outbound actions (no send/dispatch in responses)
 *
 * Mocks Clerk auth, Supabase workspace access, and the demo data layer.
 * Tests the real requireDemoAccess logic (not mocked) to verify the
 * owner-role check is enforced.
 */

// Mock next/server
jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: any, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        status: init?.status ?? 200,
        headers: { 'content-type': 'application/json' },
      }),
  },
}));

// Mock Clerk auth
jest.mock('@clerk/nextjs/server', () => ({
  auth: jest.fn(),
}));

// Mock workspace access
jest.mock('@/lib/security/workspaceAccess', () => ({
  getWorkspaceAccess: jest.fn(),
}));

// Mock demo server (returns synthetic data)
jest.mock('@/lib/pilots/clientOps/demoServer', () => ({
  getDemoData: jest.fn(() => ({
    result: {
      engagementId: 'eng_synth_2026_q4_tax_prep_001',
      tenantId: 'tenant_synth_acme_advisory_001',
      workspaceId: 'ws_synth_acme_advisory_main',
      evaluatedAt: '2026-11-22T00:00:00.000Z',
      evaluatorVersion: 'client-ops-c0-1.0.0',
      metrics: {
        totalItems: 15,
        receivedCount: 11,
        missingCount: 4,
        uncertainCount: 0,
        requiredCompleteness: 0.6,
        meanConfidence: 0.843,
        evidenceSpanCount: 10,
      },
      determinations: [
        { itemId: 'item_identity_drivers_license', status: 'received', confidence: 0.8, matchCount: 2, evidenceIds: ['ev1'], uncertaintyReason: undefined },
        { itemId: 'item_identity_ssn', status: 'missing', confidence: 0.9, matchCount: undefined, evidenceIds: [], uncertaintyReason: 'Exclusion keywords detected' },
      ],
      citedEvidence: [
        { evidenceId: 'ev1', description: 'Driver license', charStart: 0, charEnd: 100, contentHash: 'sha256:abc123' },
      ],
    },
    proposal: {
      engagementId: 'eng_synth_2026_q4_tax_prep_001',
      followUpDraft: {
        subject: 'Action Required',
        body: 'Please provide missing items.',
        actionItems: ['Provide: SSN'],
        tone: 'professional',
        generatedAt: '2026-11-22T00:00:00.000Z',
      },
      requiresHumanVerification: ['item_identity_ssn'],
      flaggedForReview: [],
      summary: 'Synthetic demo summary',
    },
  })),
}));

const { auth } = jest.requireMock('@clerk/nextjs/server');
const { getWorkspaceAccess } = jest.requireMock('@/lib/security/workspaceAccess');

function makeReq(workspaceId: string): Request {
  return new Request(`http://localhost/api/demo/client-ops?workspaceId=${encodeURIComponent(workspaceId)}`);
}

function requireRoute(routeFile: string) {
  // No resetModules — mock implementations must persist across calls.
  // The route module is cached; requireDemoAccess reads mocks at call time.
  return require(routeFile);
}

describe('C1 demo routes — feature gate', () => {
  beforeEach(() => {
    process.env.ENABLE_CLIENT_OPS_DEMO = 'false';
    (auth as jest.Mock).mockResolvedValue({ userId: 'user_owner' });
    (getWorkspaceAccess as jest.Mock).mockResolvedValue({ role: 'owner', source: 'workspace_owner' });
  });

  afterEach(() => {
    delete process.env.ENABLE_CLIENT_OPS_DEMO;
  });

  it('returns 404 when feature gate is off', async () => {
    const { GET } = requireRoute('@/app/api/demo/client-ops/route');
    const res = await GET(makeReq('ws_owner'));
    expect(res.status).toBe(404);
  });

  it('returns 404 when feature gate is off (checklist route)', async () => {
    const { GET } = requireRoute('@/app/api/demo/client-ops/checklist/route');
    const res = await GET(makeReq('ws_owner'));
    expect(res.status).toBe(404);
  });

  it('returns 404 when production is active even if feature flag is true', async () => {
    // Simulate production environment — demo must stay off regardless of flag
    ;(process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    process.env.ENABLE_CLIENT_OPS_DEMO = 'true';
    (auth as jest.Mock).mockResolvedValue({ userId: 'user_owner' });
    (getWorkspaceAccess as jest.Mock).mockResolvedValue({
      role: 'owner',
      source: 'workspace_owner',
      workspaceId: 'ws_owner',
      userId: 'user_owner',
      permissions: ['*'],
    });

    const { GET } = requireRoute('@/app/api/demo/client-ops/route');
    const res = await GET(makeReq('ws_owner'));
    expect(res.status).toBe(404);

    delete (process.env as Record<string, string | undefined>).NODE_ENV;
    delete process.env.ENABLE_CLIENT_OPS_DEMO;
  });
});

describe('C1 demo routes — feature gate enabled', () => {
  beforeEach(() => {
    process.env.ENABLE_CLIENT_OPS_DEMO = 'true';
  });

  afterEach(() => {
    delete process.env.ENABLE_CLIENT_OPS_DEMO;
  });

  describe('authentication', () => {
    it('returns 401 when not authenticated', async () => {
      (auth as jest.Mock).mockResolvedValue({ userId: null });
      const { GET } = requireRoute('@/app/api/demo/client-ops/route');
      const res = await GET(makeReq('ws_owner'));
      expect(res.status).toBe(401);
    });

    it('returns 401 when not authenticated (approval route)', async () => {
      (auth as jest.Mock).mockResolvedValue({ userId: null });
      const { GET } = requireRoute('@/app/api/demo/client-ops/approval/route');
      const res = await GET(makeReq('ws_owner'));
      expect(res.status).toBe(401);
    });
  });

  describe('owner authorization', () => {
    beforeEach(() => {
      (auth as jest.Mock).mockResolvedValue({ userId: 'user_viewer' });
    });

    it('returns 403 when user is a viewer (workspace:read is insufficient)', async () => {
      (getWorkspaceAccess as jest.Mock).mockResolvedValue({
        role: 'viewer',
        source: 'workspace_members',
        workspaceId: 'ws_viewer',
        userId: 'user_viewer',
        permissions: ['workspace:read', 'memory:read', 'document:read'],
      });

      const { GET } = requireRoute('@/app/api/demo/client-ops/route');
      const res = await GET(makeReq('ws_viewer'));
      expect(res.status).toBe(403);
    });

    it('returns 403 when user is a member (not owner)', async () => {
      (getWorkspaceAccess as jest.Mock).mockResolvedValue({
        role: 'member',
        source: 'workspace_members',
        workspaceId: 'ws_member',
        userId: 'user_viewer',
        permissions: ['workspace:read', 'memory:read', 'memory:write', 'document:read', 'document:write'],
      });

      const { GET } = requireRoute('@/app/api/demo/client-ops/checklist/route');
      const res = await GET(makeReq('ws_member'));
      expect(res.status).toBe(403);
    });

    it('returns 403 when workspace access is null', async () => {
      (getWorkspaceAccess as jest.Mock).mockResolvedValue(null);

      const { GET } = requireRoute('@/app/api/demo/client-ops/evidence/route');
      const res = await GET(makeReq('ws_nonexistent'));
      expect(res.status).toBe(403);
    });

    it('returns 200 when user is an owner', async () => {
      (getWorkspaceAccess as jest.Mock).mockResolvedValue({
        role: 'owner',
        source: 'workspace_owner',
        workspaceId: 'ws_owner',
        userId: 'user_owner',
        permissions: ['*'],
      });

      const { GET } = requireRoute('@/app/api/demo/client-ops/route');
      const res = await GET(makeReq('ws_owner'));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.engagementId).toBe('eng_synth_2026_q4_tax_prep_001');
      expect(body.metrics.totalItems).toBe(15);
    });

    it('returns 200 for owner on all five routes', async () => {
      (getWorkspaceAccess as jest.Mock).mockResolvedValue({
        role: 'owner',
        source: 'workspace_owner',
        workspaceId: 'ws_owner',
        userId: 'user_owner',
        permissions: ['*'],
      });

      const routes = [
        '@/app/api/demo/client-ops/route',
        '@/app/api/demo/client-ops/checklist/route',
        '@/app/api/demo/client-ops/evidence/route',
        '@/app/api/demo/client-ops/uncertainty/route',
        '@/app/api/demo/client-ops/approval/route',
      ];

      for (const routeFile of routes) {
        const { GET } = requireRoute(routeFile);
        const res = await GET(makeReq('ws_owner'));
        expect(res.status).toBe(200);
      }
    });
  });

  describe('input validation', () => {
    beforeEach(() => {
      (auth as jest.Mock).mockResolvedValue({ userId: 'user_owner' });
      (getWorkspaceAccess as jest.Mock).mockResolvedValue({
        role: 'owner',
        source: 'workspace_owner',
        workspaceId: 'ws_owner',
        userId: 'user_owner',
        permissions: ['*'],
      });
    });

    it('returns 400 when workspaceId is missing', async () => {
      const { GET } = requireRoute('@/app/api/demo/client-ops/route');
      const res = await GET(new Request('http://localhost/api/demo/client-ops'));
      expect(res.status).toBe(400);
    });

    it('returns 400 when workspaceId is missing (approval route)', async () => {
      const { GET } = requireRoute('@/app/api/demo/client-ops/approval/route');
      const res = await GET(new Request('http://localhost/api/demo/client-ops/approval'));
      expect(res.status).toBe(400);
    });
  });

  describe('no outbound actions', () => {
    beforeEach(() => {
      (auth as jest.Mock).mockResolvedValue({ userId: 'user_owner' });
      (getWorkspaceAccess as jest.Mock).mockResolvedValue({
        role: 'owner',
        source: 'workspace_owner',
        workspaceId: 'ws_owner',
        userId: 'user_owner',
        permissions: ['*'],
      });
    });

    it('follow-up draft has no send/dispatch/mutate fields', async () => {
      const { GET } = requireRoute('@/app/api/demo/client-ops/approval/route');
      const res = await GET(makeReq('ws_owner'));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.followUpDraft.send).toBeUndefined();
      expect(body.followUpDraft.dispatch).toBeUndefined();
      expect(body.followUpDraft.mutate).toBeUndefined();
      expect(body.notice).toContain('review-only');
      expect(body.notice).toContain('No message has been sent');
    });
  });
});
