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
 *
 * Sandboxes may contact the npm registry for trusted template dependencies,
 * but runtime code has no general outbound network access. Public sharing
 * still requires independent ingress authorization (Issue #479).
 */
import { Sandbox } from '@vercel/sandbox';
import type { PreviewManifest, PreviewSourceFile } from './previewManifest';
import { assemblePreviewProject, projectFiles } from './previewAssembler';
import { makePreviewManifest } from './previewManifest';
import { supabaseAdmin } from '@/lib/supabaseClient';

const PREVIEW_PORT = 3000;
const MAX_SANDBOX_TIMEOUT_MS = 24 * 60 * 60 * 1000; // Pro/Enterprise max
const DEFAULT_SANDBOX_TIMEOUT_MS = 45 * 60 * 1000; // Hobby max
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

function resolveTimeoutMs(): number {
  const env = process.env.PREVIEW_SANDBOX_TIMEOUT_MS;
  if (env) {
    const ms = Number(env);
    if (!Number.isNaN(ms) && ms > 0) {
      return Math.min(ms, MAX_SANDBOX_TIMEOUT_MS);
    }
  }
  return DEFAULT_SANDBOX_TIMEOUT_MS;
}

type SandboxInstance = Awaited<ReturnType<typeof Sandbox.create>>;

/**
 * Provision an isolated sandbox for a completed Code Builder build.
 *
 * Flow:
 * 1. Verify feature flag is enabled.
 * 2. Load the completed build (ownership checked via userId).
 * 3. Re-verify manifest integrity from saved files_json.
 * 4. Create a Vercel Sandbox with port 3000 exposed.
 * 5. Write template + generated files into /app (batch writeFiles).
 * 6. npm install, next build, next start (detached) — exitCode checked.
 * 7. HTTP health check against sandbox.domain(PORT).
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
  // P1: derive workspace from the build record, not the request.
  if (workspaceId && workspaceId !== build.workspace_id) {
    throw new Error('[sandboxAdapter] workspace ownership mismatch');
  }
  const resolvedWorkspaceId = build.workspace_id ?? null;

  // ── 2. Re-verify manifest integrity from saved artifacts ─────────────
  const generatedFiles = build.files_json as unknown as PreviewSourceFile[];
  const manifest = makePreviewManifest(buildId, generatedFiles);

  // ── 3. Persist preview row (provisioning) ────────────────────────────
  const previewId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + resolveTimeoutMs()).toISOString();

  const { data: row, error: insertError } = await sb
    .from('preview_sandboxes')
    .insert({
      id: previewId,
      build_id: buildId,
      user_id: userId,
      workspace_id: resolvedWorkspaceId,
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
      timeout: resolveTimeoutMs(),
      resources: { vcpus: 1 },
      persistent: false,
      // Only trusted dependencies can be downloaded. Generated code is not
      // allowed to contact arbitrary network destinations or internal APIs.
      networkPolicy: { allow: ['registry.npmjs.org'] },
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
      await sandbox.fs.writeFile(`/app/${file.path}`, file.content);
    }

    // ── 6. npm install, next build, next start (detached) ─────────────
    // P0: check exitCode after every command; fail fast with diagnostics.
    const installResult = await sandbox.runCommand({
      cmd: 'npm',
      args: ['install', '--ignore-scripts', '--no-audit', '--no-fund'],
      cwd: '/app',
    });
    if (installResult.exitCode !== 0) {
      throw new Error(`[sandboxAdapter] npm install failed (exit ${installResult.exitCode})`);
    }

    const buildResult = await sandbox.runCommand({ cmd: 'npx', args: ['next', 'build'], cwd: '/app' });
    if (buildResult.exitCode !== 0) {
      throw new Error(`[sandboxAdapter] next build failed (exit ${buildResult.exitCode})`);
    }

    const startResult = await sandbox.runCommand({
      cmd: 'npx',
      args: ['next', 'start', '-p', String(PREVIEW_PORT)],
      cwd: '/app',
      detached: true,
    });
    if (startResult.exitCode !== 0) {
      throw new Error(`[sandboxAdapter] next start failed (exit ${startResult.exitCode})`);
    }

    // ── 7. Resolve preview URL from sandbox domain ─────────────────────
    // P0: use sandbox.domain(port) instead of sandbox.routes.
    const sandboxUrl = sandbox.domain(PREVIEW_PORT);

    // ── 8. HTTP health check ──────────────────────────────────────────
    await healthCheck(sandboxUrl);

    // ── 9. Mark ready ─────────────────────────────────────────────────
    await sb
      .from('preview_sandboxes')
      .update({
        sandbox_id: sandbox.name,
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
    // Mark failed and attempt real sandbox cleanup (P1).
    await sb
      .from('preview_sandboxes')
      .update({ status: 'failed', updated_at: new Date().toISOString() })
      .eq('id', previewId);

    if (sandbox) {
      try {
        await sandbox.stop();
      } catch {
        // Best-effort: sandbox may already be stopped.
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
    // Do not mark an exposed origin expired before shutting its VM down.
    await destroySandbox(previewId, userId);
    return { status: 'expired' };
  }

  return {
    status: (row.status as SandboxStatus['status']),
    url: row.sandbox_url,
  };
}

/**
 * Destroy a preview sandbox — actually stops the VM, not just DB status.
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
    if (!row.sandbox_id) {
      // Provisioning races need provider reconciliation, not false success.
      throw new Error('[sandboxAdapter] cannot verify stop: missing sandbox locator');
    }
    const sandbox = await Sandbox.get({ name: row.sandbox_id });
    // Failure must propagate. A live public VM is not a revoked preview.
    await sandbox.stop();
  }

  const { error: updateError } = await sb
    .from('preview_sandboxes')
    .update({ status: 'expired', updated_at: new Date().toISOString() })
    .eq('id', previewId);
  if (updateError) {
    throw new Error(`[sandboxAdapter] stopped VM but status update failed: ${updateError.message}`);
  }
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
  if (!process.env.VERCEL_OIDC_TOKEN) {
    throw new Error('[sandboxAdapter] VERCEL_OIDC_TOKEN is required');
  }
}
