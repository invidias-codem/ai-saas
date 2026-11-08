import type { PreviewSourceFile } from '@/lib/code-builder/previewManifest';

// ─── Mocks ─────────────────────────────────────────────────────────────────

// Mock @vercel/sandbox so tests never provision real VMs.
const mockRunCommand = jest.fn().mockResolvedValue({ exitCode: 0 });
const mockStop = jest.fn().mockResolvedValue({ session: {} });
const mockSandboxInstance = {
  fs: { writeFile: jest.fn(), writeFiles: jest.fn() },
  runCommand: mockRunCommand,
  domain: jest.fn().mockReturnValue('https://preview-xyz.vercel-sandbox.com'),
  name: 'lattice-preview-xyz',
  [Symbol.asyncDispose]: jest.fn().mockResolvedValue(undefined),
  stop: mockStop,
};

jest.mock('@vercel/sandbox', () => ({
  Sandbox: {
    create: jest.fn().mockResolvedValue(mockSandboxInstance),
    get: jest.fn().mockResolvedValue(mockSandboxInstance),
  },
}));

// Set Supabase env so the real client module loads.
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_test-key-000000000000000000000000';

// Module-level mock query builder — accessible from both factory and tests.
export const mockQB = {
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  maybeSingle: jest.fn(),
  insert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  single: jest.fn().mockReturnThis(),
};

// Mock fetch for health checks.
global.fetch = jest.fn().mockResolvedValue(new Response(null, { status: 200 }));

// Mock crypto.randomUUID for deterministic preview IDs.
const mockRandomUUID = jest.fn().mockReturnValue('preview_1');
Object.defineProperty(globalThis, 'crypto', {
  value: { randomUUID: mockRandomUUID },
  writable: true,
});

jest.mock('@/lib/supabaseClient', () => ({
  supabaseAdmin: {
    from: jest.fn().mockReturnValue(mockQB),
    insert: jest.fn().mockReturnValue(mockQB),
    update: jest.fn().mockReturnValue(mockQB),
  },
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────
import {
  provisionSandbox,
  sandboxStatus,
  destroySandbox,
  sandboxAdapterSelfCheck,
} from '@/lib/code-builder/sandboxAdapter';
import { Sandbox } from '@vercel/sandbox';
import { supabaseAdmin } from '@/lib/supabaseClient';

const mockSandboxCreate = Sandbox.create as jest.Mock;
const mockSandboxGet = Sandbox.get as jest.Mock;
const mockFrom = (supabaseAdmin as any).from as jest.Mock;
const mockInsert = (supabaseAdmin as any).insert as jest.Mock;
const mockUpdate = (supabaseAdmin as any).update as jest.Mock;

const buildId = '00000000-0000-4000-8000-000000000001';
const userId = 'user_123';
const workspaceId = 'workspace_456';

const generatedFiles: PreviewSourceFile[] = [
  { path: 'app/page.tsx', content: "export default function Page() { return <h1>hi</h1>; }\n" },
  { path: 'components/Button.tsx', content: 'export const Button = () => <button>hi</button>;\n' },
];

function mockBuildLookup(buildStatus: string = 'completed', files: PreviewSourceFile[] = generatedFiles) {
  mockQB.maybeSingle.mockResolvedValueOnce({
    data: {
      build_id: buildId,
      user_id: userId,
      workspace_id: workspaceId,
      status: buildStatus,
      files_json: files,
      plan_json: { appName: 'test-app' },
    },
    error: null,
  });
}

function mockPreviewRowInsert() {
  mockQB.maybeSingle.mockResolvedValueOnce({ data: { id: 'preview_1' }, error: null });
}

function mockPreviewRowUpdate() {
  mockQB.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('code builder sandbox adapter (Phase 8C)', () => {
  beforeEach(() => {
    // mockClear preserves implementations (mockReturnValue) but clears calls.
    mockFrom.mockClear();
    mockInsert.mockClear();
    mockUpdate.mockClear();
    mockRunCommand.mockClear();
    mockStop.mockClear();
    mockSandboxCreate.mockClear();
    mockSandboxGet.mockClear();
    mockSandboxInstance.fs.writeFile.mockClear();
    mockSandboxInstance.fs.writeFiles.mockClear();
    mockSandboxInstance.domain.mockClear();
    mockQB.maybeSingle.mockReset();
    mockQB.single.mockReset();
    mockQB.insert.mockReset();
    mockQB.update.mockReset();
    mockQB.select.mockReturnThis();
    mockQB.eq.mockReturnThis();
    mockQB.insert.mockReturnThis();
    mockQB.update.mockReturnThis();
    mockQB.single.mockReturnThis();
    process.env.ENABLE_PREVIEW_SANDBOX = 'true';
    process.env.PREVIEW_SANDBOX_TIMEOUT_MS = '4500000'; // 75 min
  });

  afterEach(() => {
    delete process.env.ENABLE_PREVIEW_SANDBOX;
    delete process.env.PREVIEW_SANDBOX_TIMEOUT_MS;
  });

  it('self-check passes when feature flag is off', () => {
    delete process.env.ENABLE_PREVIEW_SANDBOX;
    expect(() => sandboxAdapterSelfCheck()).not.toThrow();
  });

  it('provisions a sandbox and returns a ready status with isolated URL', async () => {
    mockBuildLookup('completed', generatedFiles);
    mockPreviewRowInsert();
    mockPreviewRowUpdate();

    const result = await provisionSandbox(buildId, userId, workspaceId);

    expect(result.status).toBe('ready');
    expect(result.sandboxUrl).toBe('https://preview-xyz.vercel-sandbox.com');
    expect(result.previewId).toBe('preview_1');
    expect(mockSandboxCreate).toHaveBeenCalledTimes(1);

    // Verify no secrets in sandbox env
    const createCall = mockSandboxCreate.mock.calls[0][0];
    expect(createCall.env).not.toHaveProperty('SUPABASE_SERVICE_ROLE_KEY');
    expect(createCall.env).not.toHaveProperty('NVIDIA_API_KEY');
    expect(createCall.ports).toContain(3000);
    expect(createCall.name).toContain('lattice-preview');
    expect(createCall.networkPolicy).toEqual({ allow: ['registry.npmjs.org'] });
    expect(createCall.persistent).toBe(false);

    // Verify files were written (template + generated) via individual writeFile calls
    expect(mockSandboxInstance.fs.writeFile).toHaveBeenCalledTimes(
      5 + generatedFiles.length // 5 template + 2 generated = 7
    );
    // Verify package.json was written
    const pkgCall = mockSandboxInstance.fs.writeFile.mock.calls.find(
      (c) => c[0] === '/app/package.json'
    );
    expect(pkgCall).toBeDefined();
    expect(pkgCall[1]).toContain('next');

    // Verify all three commands ran with exitCode checking
    expect(mockRunCommand).toHaveBeenCalledTimes(3);
    const installCall = mockRunCommand.mock.calls[0][0];
    expect(installCall.cmd).toBe('npm');
    expect(installCall.args).toContain('--ignore-scripts');

    // Verify domain() was used (not routes)
    expect(mockSandboxInstance.domain).toHaveBeenCalledWith(3000);
  });

  it('respects configurable timeout capped at 24h', async () => {
    mockBuildLookup('completed', generatedFiles);
    mockPreviewRowInsert();
    mockPreviewRowUpdate();

    process.env.PREVIEW_SANDBOX_TIMEOUT_MS = '100000000'; // > 24h, should be capped
    await provisionSandbox(buildId, userId, workspaceId);

    const createCall = mockSandboxCreate.mock.calls[0][0];
    expect(createCall.timeout).toBe(24 * 60 * 60 * 1000); // capped at max
  });

  it('throws when feature flag is off', async () => {
    delete process.env.ENABLE_PREVIEW_SANDBOX;
    await expect(provisionSandbox(buildId, userId)).rejects.toThrow(
      'feature-flagged off'
    );
  });

  it('throws when build is not completed', async () => {
    mockBuildLookup('running', []);
    await expect(provisionSandbox(buildId, userId)).rejects.toThrow(
      'not completed'
    );
  });

  it('throws on ownership mismatch', async () => {
    mockQB.maybeSingle.mockResolvedValueOnce({
      data: {
        build_id: buildId,
        user_id: 'other_user',
        status: 'completed',
        files_json: generatedFiles,
        plan_json: { appName: 'test-app' },
      },
      error: null,
    });
    await expect(provisionSandbox(buildId, userId)).rejects.toThrow(
      'ownership mismatch'
    );
  });

  it('rejects a caller-supplied workspace inconsistent with the build', async () => {
    mockBuildLookup('completed', generatedFiles);
    await expect(provisionSandbox(buildId, userId, 'other-workspace')).rejects.toThrow(
      'workspace ownership mismatch'
    );
    expect(mockSandboxCreate).not.toHaveBeenCalled();
  });

  it('fails when npm install exits non-zero and stops sandbox', async () => {
    mockBuildLookup('completed', generatedFiles);
    mockPreviewRowInsert();
    // First command (npm install) fails
    mockRunCommand.mockResolvedValueOnce({ exitCode: 1 });

    await expect(provisionSandbox(buildId, userId)).rejects.toThrow(
      'npm install failed'
    );
    // Sandbox should be stopped on failure
    expect(mockStop).toHaveBeenCalled();
  });

  it('fails when next build exits non-zero', async () => {
    mockBuildLookup('completed', generatedFiles);
    mockPreviewRowInsert();
    // npm install succeeds, next build fails
    mockRunCommand.mockResolvedValueOnce({ exitCode: 0 });
    mockRunCommand.mockResolvedValueOnce({ exitCode: 1 });

    await expect(provisionSandbox(buildId, userId)).rejects.toThrow(
      'next build failed'
    );
    expect(mockStop).toHaveBeenCalled();
  });

  it('sandboxStatus returns ready with URL', async () => {
    mockQB.maybeSingle.mockResolvedValueOnce({
      data: {
        id: 'preview_1',
        sandbox_id: 'sbx_123',
        sandbox_url: 'https://preview-xyz.vercel-sandbox.com',
        status: 'ready',
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        user_id: userId,
      },
      error: null,
    });

    const status = await sandboxStatus('preview_1', userId);
    expect(status.status).toBe('ready');
    expect(status.url).toBe('https://preview-xyz.vercel-sandbox.com');
  });

  it('sandboxStatus returns expired when past expires_at', async () => {
    mockQB.maybeSingle.mockResolvedValueOnce({
      data: {
        id: 'preview_1',
        sandbox_id: 'sbx_123',
        sandbox_url: 'https://preview-xyz.vercel-sandbox.com',
        status: 'ready',
        expires_at: new Date(Date.now() - 1000).toISOString(),
        user_id: userId,
      },
      error: null,
    });
    // Expiry now executes a full provider stop, including a second DB lookup
    // for the sandbox locator; a timestamp alone must not revoke access.
    mockQB.maybeSingle.mockResolvedValueOnce({
      data: { sandbox_id: 'sbx_123', status: 'ready', user_id: userId },
      error: null,
    });

    const status = await sandboxStatus('preview_1', userId);
    expect(status.status).toBe('expired');
    expect(mockStop).toHaveBeenCalled();
  });

  it('destroySandbox stops the VM and marks expired', async () => {
    mockQB.maybeSingle.mockResolvedValueOnce({
      data: { sandbox_id: 'sbx_123', status: 'ready', user_id: userId },
      error: null,
    });
    mockQB.single.mockResolvedValueOnce({ data: null, error: null });

    await destroySandbox('preview_1', userId);
    expect(mockSandboxGet).toHaveBeenCalledWith({ name: 'sbx_123' });
    expect(mockStop).toHaveBeenCalled();
    // update should be called with status expired
    expect(mockQB.update.mock.calls[0][0]?.status).toBe('expired');
  });

  it('failed provider stop must not be recorded as expired', async () => {
    mockQB.maybeSingle.mockResolvedValueOnce({
      data: { sandbox_id: 'sbx_123', status: 'ready', user_id: userId }, error: null,
    });
    mockStop.mockRejectedValueOnce(new Error('provider unavailable'));
    await expect(destroySandbox('preview_1', userId)).rejects.toThrow('provider unavailable');
    expect(mockQB.update).not.toHaveBeenCalled();
  });

  it('fails closed when a provisioning record has no sandbox locator', async () => {
    mockQB.maybeSingle.mockResolvedValueOnce({
      data: { sandbox_id: '', status: 'provisioning', user_id: userId }, error: null,
    });
    await expect(destroySandbox('preview_1', userId)).rejects.toThrow('missing sandbox locator');
    expect(mockQB.update).not.toHaveBeenCalled();
  });

  it('destroySandbox on ownership mismatch throws', async () => {
    mockQB.maybeSingle.mockResolvedValueOnce({
      data: { sandbox_id: 'sbx_123', status: 'ready', user_id: 'other_user' },
      error: null,
    });
    await expect(destroySandbox('preview_1', userId)).rejects.toThrow(
      'ownership mismatch'
    );
  });
});
