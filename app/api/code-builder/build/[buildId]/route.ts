// app/api/code-builder/build/[buildId]/route.ts
// Product-boundary read endpoint for durable Code Builder state.
// The browser reads Lattice's durable build state through this endpoint.
// Do not expose Trigger's run API as the product API.

import { requireAuth, handleAuthError } from '@/lib/security/apiAuth';
import { getBuild } from '@/lib/code-builder/buildStore';
import type { BuildStatus, BuildPhase } from '@/lib/code-builder/buildStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface BuildStatusResponse {
  buildId: string;
  status: BuildStatus;
  phase: BuildPhase;
  progress: number;
  error: {
    code: string | null;
    message: string;
  } | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ buildId: string }> }
) {
  try {
    const user = await requireAuth();
    const { buildId } = await params;

    if (!buildId) {
      return Response.json({ error: 'Missing buildId' }, { status: 400 });
    }

    const row = await getBuild(buildId);

    if (!row) {
      // Do not reveal whether a build exists for another user.
      // Return 404 for both "not found" and "not owned by user".
      return Response.json(
        { error: 'Build not found' },
        { status: 404 }
      );
    }

    // Authorization: user may only retrieve their own build
    if (row.user_id !== user.userId) {
      // Same 404 response to avoid existence disclosure
      return Response.json(
        { error: 'Build not found' },
        { status: 404 }
      );
    }

    const response: BuildStatusResponse = {
      buildId: row.build_id,
      status: row.status,
      phase: row.phase,
      progress: row.progress,
      error: row.error_code || row.error_message
        ? {
            code: row.error_code ?? null,
            message: row.error_message || 'Build failed',
          }
        : null,
      createdAt: row.created_at ?? new Date().toISOString(),
      startedAt: row.started_at ?? null,
      completedAt: row.completed_at ?? null,
    };

    return Response.json(response);
  } catch (error: any) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error('[UCOL:Build] GET error:', error);
    return Response.json({ error: 'Internal Server Error', details: error?.message }, { status: 500 });
  }
}