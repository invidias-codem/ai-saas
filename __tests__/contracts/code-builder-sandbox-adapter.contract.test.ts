import type { PreviewSourceFile } from '@/lib/code-builder/previewManifest';

// ─── Mocks ─────────────────────────────────────────────────────────────────

// Mock @vercel/sandbox so tests never provision real VMs.
const routes = [{ url: 'https://preview-xyz.vercel-sandbox.com', subdomain: 'preview-xyz', port: 3000 }];
const metadata = { id: 'sbx_mock_123' };
const mockRunCommand = jest.fn().mockResolvedValue({ exitCode: 0 });
const mockAsyncDispose = jest.fn().mockResolvedValue(undefined);
const mockSandboxInstance = {
  fs: { writeFile: jest.fn() },
  runCommand: mockRunCommand,
  metadata,
  routes,
  [Symbol.asyncDispose]: mockAsyncDispose,
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
const mockFrom = supabaseAdmin.from as jest.Mock;
const mockInsert = supabaseAdmin.insert as jest.Mock;
const mockUpdate = supabaseAdmin.update as jest.Mock;

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
    mockAsyncDispose.mockClear();
    mockSandboxInstance.fs.writeFile.mockClear();
    // Clear maybeSingle's ResolvedValueOnce queue between tests
    mockQB.maybeSingle.mockReset();
    // Re-establish mockReturnThis after reset
    mockQB.select.mockReturnThis();
    mockQB.eq.mockReturnThis();
    process.env.ENABLE_PREVIEW_SANDBOX = 'true';
  });

  afterEach(() => {
    delete process.env.ENABLE_PREVIEW_SANDBOX;
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

    // Verify files were written (template + generated)
    expect(mockSandboxInstance.fs.writeFile).toHaveBeenCalledTimes(
      5 + generatedFiles.length // 5 template + 2 generated = 7
    );
    // Verify package.json was written
    const pkgCall = mockSandboxInstance.fs.writeFile.mock.calls.find(
      (c) => c[0] === '/app/package.json'
    );
    expect(pkgCall).toBeDefined();
    expect(pkgCall[1]).toContain('next');
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
    // The update() call from expiry marking also needs a maybeSingle
    mockQB.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const status = await sandboxStatus('preview_1', userId);
    expect(status.status).toBe('expired');
  });

  it('destroySandbox cleans up and marks expired', async () => {
    mockQB.maybeSingle.mockResolvedValueOnce({
      data: { sandbox_id: 'sbx_123', status: 'ready', user_id: userId },
      error: null,
    });
    mockQB.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    await destroySandbox('preview_1', userId);
    expect(mockSandboxGet).toHaveBeenCalledWith({ sandboxId: 'sbx_123' });
    const updateCalls = mockQB.update.mock.calls;
    expect(updateCalls.some((call) => call[0]?.status === 'expired')).toBe(true);
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
