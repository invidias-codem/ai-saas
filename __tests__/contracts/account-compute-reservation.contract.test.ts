/**
 * Account Compute Plane — A1 contract tests.
 *
 * Covers:
 *  1. ENABLE_ACCOUNT_COMPUTE flag gating (default off).
 *  2. Reservation RPC calls pass through owner/operation key/entitlement.
 *  3. API route returns 503 when disabled, 401 when unauthenticated.
 *
 * All seams mocked; no real Supabase, Clerk, or provider calls.
 */
jest.mock('@clerk/nextjs/server', () => ({ auth: jest.fn() }));
jest.mock('@/lib/supabaseClient', () => ({
  supabaseAdmin: { rpc: jest.fn() },
  supabase: null,
}));
import { accountVmReservationKey } from '@/lib/intelligence/execution/accountCompute/contracts';
jest.mock('next/server', () => ({
  NextResponse: class {
    static json(body: unknown, init?: ResponseInit) {
      return { body, status: (init as { status?: number } | undefined)?.status ?? 200 };
    }
  },
}));
jest.mock('@/lib/security/rateLimit', () => ({
  limitApiEndpoint: jest.fn().mockResolvedValue({ success: true }),
}));

function getMocks() {
  return {
    rpc: require('@/lib/supabaseClient').supabaseAdmin.rpc as jest.Mock,
    auth: require('@clerk/nextjs/server').auth as jest.Mock,
  };
}

function resetAll() {
  const { rpc, auth } = getMocks();
  jest.clearAllMocks();
  rpc.mockReset();
  auth.mockReset();
}

beforeEach(resetAll);

describe('A1 — default-off flag', () => {
  it('is disabled unless ENABLE_ACCOUNT_COMPUTE=true', () => {
    delete process.env.ENABLE_ACCOUNT_COMPUTE;
    jest.resetModules();
    const mod = require('@/lib/intelligence/execution/accountCompute/reservation');
    expect(mod.ENABLE_ACCOUNT_COMPUTE).toBe(false);
  });

  it('is enabled when ENABLE_ACCOUNT_COMPUTE=true', () => {
    process.env.ENABLE_ACCOUNT_COMPUTE = 'true';
    jest.resetModules();
    const mod = require('@/lib/intelligence/execution/accountCompute/reservation');
    expect(mod.ENABLE_ACCOUNT_COMPUTE).toBe(true);
    delete process.env.ENABLE_ACCOUNT_COMPUTE;
  });
});

describe('A1 — claimAccountVm passes through RPC args', () => {
  it('calls account_compute_claim_vm with owner, key, class, entitlement', async () => {
    jest.resetModules();
    const { rpc } = getMocks();
    const { claimAccountVm } = require('@/lib/intelligence/execution/accountCompute/reservation');

    rpc.mockResolvedValue({
      data: {
        claimed: true, replay: false, vm_id: 'vm-1', desktop_id: null,
        provider_id: null, state: 'provisioning', generation: 1,
        operation_key: accountVmReservationKey('user_A'),
      },
      error: null,
    });

    const opKey = accountVmReservationKey('user_A');

    const result = await claimAccountVm(
      'user_A',
      opKey,
      'daytona-vm-small',
      { vcpus: 2, memoryMb: 4096, storageGb: 20, maxConcurrentWorkspaces: 10 }
    );

    expect(rpc).toHaveBeenCalledWith('account_compute_claim_vm', {
      p_owner_user_id: 'user_A',
      p_operation_key: opKey,
      p_vm_class: 'daytona-vm-small',
      p_entitlement: { vcpus: 2, memoryMb: 4096, storageGb: 20, maxConcurrentWorkspaces: 10 },
    });
    expect(result.claimed).toBe(true);
    expect(result.replay).toBe(false);
    expect(result.vmId).toBe('vm-1');
    expect(result.state).toBe('provisioning');
  });
});

describe('A1 — API route gating', () => {
  it('returns 503 when feature disabled', async () => {
    jest.resetModules();
    const { auth } = getMocks();
    process.env.ENABLE_ACCOUNT_COMPUTE = 'false';
    const { POST } = require('@/app/api/account/compute/route');

    auth.mockResolvedValue({ userId: 'user_A' });
    const res = await POST(new Request('https://lattice.test/api/account/compute', {
      method: 'POST', body: JSON.stringify({}),
    }));
    expect((res as { status: number }).status).toBe(503);
    delete process.env.ENABLE_ACCOUNT_COMPUTE;
  });

  it('returns 401 when unauthenticated', async () => {
    jest.resetModules();
    const { auth } = getMocks();
    process.env.ENABLE_ACCOUNT_COMPUTE = 'true';
    const { POST } = require('@/app/api/account/compute/route');

    auth.mockResolvedValue({ userId: null });
    const res = await POST(new Request('https://lattice.test/api/account/compute', {
      method: 'POST', body: JSON.stringify({}),
    }));
    expect((res as { status: number }).status).toBe(401);
    delete process.env.ENABLE_ACCOUNT_COMPUTE;
  });

  it('claims VM when authenticated and enabled', async () => {
    jest.resetModules();
    const { auth, rpc } = getMocks();
    process.env.ENABLE_ACCOUNT_COMPUTE = 'true';
    const { POST } = require('@/app/api/account/compute/route');

    auth.mockResolvedValue({ userId: 'user_A' });
    rpc.mockResolvedValue({
      data: {
        claimed: true, replay: false, vm_id: 'vm-1', desktop_id: null,
        provider_id: null, state: 'provisioning', generation: 1,
        operation_key: accountVmReservationKey('user_A'),
      },
      error: null,
    });

    const res = await POST(new Request('https://lattice.test/api/account/compute', {
      method: 'POST',
      body: JSON.stringify({ vmClass: 'daytona-vm-small' }),
    }));
    expect((res as { status: number }).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('account_compute_claim_vm', {
      p_owner_user_id: 'user_A',
      p_operation_key: accountVmReservationKey('user_A'),
      p_vm_class: 'daytona-vm-small',
      p_entitlement: { vcpus: 2, memoryMb: 4096, storageGb: 20, maxConcurrentWorkspaces: 10 },
    });
    delete process.env.ENABLE_ACCOUNT_COMPUTE;
  });
});
