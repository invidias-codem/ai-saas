/**
 * Account Compute Plane — A2 lifecycle flag gating tests.
 *
 * The ENABLE_ACCOUNT_COMPUTE_LIFECYCLE flag is read once at module load,
 * so these tests use jest.isolateModules to read the flag under different
 * env values without affecting the shared module registry used by
 * account-compute-lifecycle.contract.test.ts.
 */
jest.mock('@/lib/intelligence/execution/accountCompute/reservation', () => ({
  ENABLE_ACCOUNT_COMPUTE: false,
  claimAccountVm: jest.fn(),
  getAccountVm: jest.fn(),
  attachWorkspaceToVm: jest.fn(),
  detachWorkspaceFromVm: jest.fn(),
  markVmReady: jest.fn(),
  markVmFailed: jest.fn(),
  resolveProvisioning: jest.fn(),
}));

describe('A2 — lifecycle flag gating', () => {
  it('is disabled unless ENABLE_ACCOUNT_COMPUTE_LIFECYCLE=true', () => {
    const prev = process.env.ENABLE_ACCOUNT_COMPUTE_LIFECYCLE;
    process.env.ENABLE_ACCOUNT_COMPUTE_LIFECYCLE = 'false';
    let disabled;
    jest.isolateModules(() => {
      disabled = require('@/lib/intelligence/execution/accountCompute/lifecycle')
        .ENABLE_ACCOUNT_COMPUTE_LIFECYCLE;
    });
    expect(disabled).toBe(false);
    process.env.ENABLE_ACCOUNT_COMPUTE_LIFECYCLE = prev;
  });

  it('throws when lifecycle disabled', async () => {
    const prev = process.env.ENABLE_ACCOUNT_COMPUTE_LIFECYCLE;
    process.env.ENABLE_ACCOUNT_COMPUTE_LIFECYCLE = 'false';
    let err;
    jest.isolateModules(() => {
      const { provisionAccountVm } = require('@/lib/intelligence/execution/accountCompute/lifecycle');
      err = provisionAccountVm('user_A', {
        id: 'test',
        capabilities: { runtimeTypes: ['linux_vm'], durableSuspend: true },
        create: jest.fn(),
        resume: jest.fn(),
        suspend: jest.fn(),
        get: jest.fn(),
      }, { vcpus: 2, memoryMb: 4096, storageGb: 20 });
    });
    await expect(err).rejects.toThrow('Account compute lifecycle is disabled');
    process.env.ENABLE_ACCOUNT_COMPUTE_LIFECYCLE = prev;
  });
});
