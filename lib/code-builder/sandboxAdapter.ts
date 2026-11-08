/**
 * Phase 8C: Vercel Sandbox adapter for isolated micro-app previews.
 *
 * Server-only. Runs in the Next.js API route (Vercel), which authenticates
 * via Vercel OIDC. The sandbox VM itself never receives platform secrets.
 *
 * Trust boundary:
 * - Generated code comes only from a validated PreviewManifest (Phase 8A)
 *   assembled by the Phase 8B assembler — never raw model output.
 * - No SUPABASE_SERVICE_ROLE_KEY, NVIDIA_API_KEY, or other platform secrets
 *   are injected into the sandbox environment.
 * - Generated code executes in a separate origin (sandbox URL), never on
 *   gen1e.xyz. See Issue #479.
 * - Feature flagged via ENABLE_PREVIEW_SANDBOX (default: off).
 */
import { Sandbox } from '@vercel/sandbox';
import type { PreviewManifest, PreviewSourceFile } from './previewManifest';
import { assemblePreviewProject, projectFiles } from './previewAssembler';
import { makePreviewManifest } from './previewManifest';
import { supabaseAdmin } from '@/lib/supabaseClient';
import { requireEnv } from '@/lib/env';

const PREVIEW_PORT = 3000;
const SANDBOX_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24 hours
const HEALTH_CHECK_TIMEOUT_MS = 120 * 1000; // 2 minutes
const HEALTH_CHECK_INTERVAL_MS = 2 * 1000; // 2 seconds

export interface SandboxProvisionResult {
  readonly previewId: string;
  readonly sandboxUrl: string;
  readonly status: 'provisioning' | 'ready' | 'failed';
}

export interface SandboxStatus {
  readonly status: 'provisioning' | 'ready' | 'failed' | 'expired';
  readonly url?: string;
  readonly error?: string;
}

function assertSupabase() {
  if (!supabaseAdmin) {
    throw new Error('[sandboxAdapter] supabaseAdmin not configured');
  }
  return supabaseAdmin!;
}

function isPreviewSandboxEnabled(): boolean {
  return process.env.ENABLE_PREVIEW_SANDBOX === 'true';
}

type SandboxInstance = Awaited<ReturnType<typeof Sandbox.create>>;

/**
 * Provision an isolated sandbox for a completed Code Builder build.
 *
 * Flow:
 * 1. Verify feature flag is enabled.
 * 2. Load the completed build (ownership checked by caller via userId).
 * 3. Re-verify manifest integrity from saved files_json.
 * 4. Create a Vercel Sandbox with port 3000 exposed.
 * 5. Write template + generated files into /app.
 * 6. npm install, next build, next start (detached).
 * 7. HTTP health check against the sandbox URL.
 * 8. Persist preview row and return the isolated preview URL.
 */
export async function provisionSandbox(
  buildId: string,
  userId: string,
  workspaceId?: string
): Promise<SandboxProvisionResult> {
  if (!isPreviewSandboxEnabled()) {
    throw new Error('[sandboxAdapter] preview sandbox is feature-flagged off');
  }

  const sb = assertSupabase();

  // ── 1. Load completed build, verify ownership ─────────────────────────
  const { data: build, error: buildError } = await sb
    .from('code_builder_builds')
    .select('build_id, user_id, workspace_id, status, files_json, plan_json')
    .eq('build_id', buildId)
    .maybeSingle();

  if (buildError) throw new Error(`[sandboxAdapter] build lookup failed: ${buildError.message}`);
  if (!build) throw new Error(`[sandboxAdapter] build not found: ${buildId}`);
  if (build.user_id !== userId) {
    throw new Error(`[sandboxAdapter] build ownership mismatch`);
  }
  if (build.status !== 'completed') {
    throw new Error(`[sandboxAdapter] build not completed: ${build.status}`);
  }
  if (!Array.isArray(build.files_json) || build.files_json.length === 0) {
    throw new Error(`[sandboxAdapter] build has no generated files`);
  }

  // ── 2. Re-verify manifest integrity from saved artifacts ─────────────
  const generatedFiles = build.files_json as unknown as PreviewSourceFile[];
  const manifest = makePreviewManifest(buildId, generatedFiles);

  // ── 3. Persist preview row (provisioning) ────────────────────────────
  const previewId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SANDBOX_TIMEOUT_MS).toISOString();

  const { data: row, error: insertError } = await sb
    .from('preview_sandboxes')
    .insert({
      id: previewId,
      build_id: buildId,
      user_id: userId,
      workspace_id: workspaceId ?? null,
      sandbox_id: '', // filled after sandbox creation
      sandbox_url: '', // filled after route resolution
      status: 'provisioning',
      expires_at: expiresAt,
    })
    .select('id')
    .maybeSingle();

  if (insertError) throw new Error(`[sandboxAdapter] preview row insert failed: ${insertError.message}`);

  let sandbox: SandboxInstance | null = null;
  try {
    // ── 4. Create isolated Vercel Sandbox ──────────────────────────────
    sandbox = await Sandbox.create({
      name: `lattice-preview-${previewId.slice(0, 8)}`,
      ports: [PREVIEW_PORT],
      timeout: SANDBOX_TIMEOUT_MS,
      resources: { vcpus: 1 },
      env: {
        NODE_ENV: 'production',
        // No platform secrets — only runtime config the generated app needs.
        NEXT_TELEMETRY_DISABLED: '1',
      },
    });

    // ── 5. Write template + generated files into /app ─────────────────
    const project = assemblePreviewProject(manifest);
    const files = projectFiles(project);

    for (const file of files) {
      const sandboxPath = `/app/${file.path}`;
      await sandbox.fs.writeFile(sandboxPath, file.content);
    }

    // ── 6. npm install, next build, next start (detached) ─────────────
    await sandbox.runCommand('npm', ['install'], { cwd: '/app' });
    await sandbox.runCommand('npx', ['next', 'build'], { cwd: '/app' });
    await sandbox.runCommand('npx', ['next', 'start', '-p', String(PREVIEW_PORT)], {
      cwd: '/app',
      detached: true,
    });

    // ── 7. Resolve preview URL from sandbox routes ─────────────────────
    const route = sandbox.routes.find((r) => r.port === PREVIEW_PORT);
    if (!route) {
      throw new Error(`[sandboxAdapter] no route exposed for port ${PREVIEW_PORT}`);
    }
    const sandboxUrl = route.url;

    // ── 8. HTTP health check ──────────────────────────────────────────
    await healthCheck(sandboxUrl);

    // ── 9. Mark ready ─────────────────────────────────────────────────
    await sb
      .from('preview_sandboxes')
      .update({
        sandbox_id: sandbox.metadata.id,
        sandbox_url: sandboxUrl,
        status: 'ready',
        updated_at: new Date().toISOString(),
      })
      .eq('id', previewId);

    return {
      previewId,
      sandboxUrl,
      status: 'ready',
    };
  } catch (err: any) {
    // Mark failed and attempt cleanup.
    await sb
      .from('preview_sandboxes')
      .update({
        status: 'failed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', previewId);

    if (sandbox) {
      try {
        await (sandbox as unknown as AsyncDisposable)[Symbol.asyncDispose]?.();
      } catch {
        // Best-effort cleanup.
      }
    }

    throw new Error(`[sandboxAdapter] provision failed: ${err?.message ?? String(err)}`);
  }
}

/**
 * Get the current status of a preview sandbox.
 */
export async function sandboxStatus(
  previewId: string,
  userId: string
): Promise<SandboxStatus> {
  const sb = assertSupabase();

  const { data: row, error } = await sb
    .from('preview_sandboxes')
    .select('id, sandbox_id, sandbox_url, status, expires_at, user_id')
    .eq('id', previewId)
    .maybeSingle();

  if (error) throw new Error(`[sandboxAdapter] status lookup failed: ${error.message}`);
  if (!row) return { status: 'failed', error: 'preview not found' };
  if (row.user_id !== userId) return { status: 'failed', error: 'ownership mismatch' };

  // Check expiration.
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await sb
      .from('preview_sandboxes')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('id', previewId);
    return { status: 'expired' };
  }

  return {
    status: (row.status as SandboxStatus['status']),
    url: row.sandbox_url,
  };
}

/**
 * Destroy a preview sandbox and mark the row expired.
 */
export async function destroySandbox(previewId: string, userId: string): Promise<void> {
  const sb = assertSupabase();

  const { data: row, error } = await sb
    .from('preview_sandboxes')
    .select('sandbox_id, status, user_id')
    .eq('id', previewId)
    .maybeSingle();

  if (error) throw new Error(`[sandboxAdapter] destroy lookup failed: ${error.message}`);
  if (!row) return;
  if (row.user_id !== userId) throw new Error(`[sandboxAdapter] ownership mismatch`);

  if (row.status === 'ready' || row.status === 'provisioning') {
    try {
      const sandbox = await Sandbox.get({ sandboxId: row.sandbox_id });
      await (sandbox as unknown as AsyncDisposable)[Symbol.asyncDispose]?.();
    } catch {
      // Best-effort: sandbox may already be gone.
    }
  }

  await sb
    .from('preview_sandboxes')
    .update({ status: 'expired', updated_at: new Date().toISOString() })
    .eq('id', previewId);
}

// ──────────────────────────────────────────────────────────────────────
// Internal helpers

async function healthCheck(url: string): Promise<void> {
  const deadline = Date.now() + HEALTH_CHECK_TIMEOUT_MS;
  let lastError: string | null = null;

  while (Date.now() < deadline) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) return;
      lastError = `HTTP ${res.status}`;
    } catch (err: any) {
      lastError = err?.message ?? String(err);
    }
    await new Promise((resolve) => setTimeout(resolve, HEALTH_CHECK_INTERVAL_MS));
  }

  throw new Error(`[sandboxAdapter] health check failed: ${lastError}`);
}

// ──────────────────────────────────────────────────────────────────────
// Self-check (runnable check — fails if the adapter contract breaks)

export function sandboxAdapterSelfCheck(): void {
  if (!isPreviewSandboxEnabled()) {
    // Feature flag off is a valid configuration; not an error.
    return;
  }
  requireEnv('VERCEL_OIDC_TOKEN');
}
