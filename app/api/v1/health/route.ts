/**
 * GET /api/v1/health — Partner API health check.
 *
 * This is the simplest partner-facing endpoint. Partners call it to verify
 * their key is valid and to confirm the gateway is reachable.
 *
 *   curl -H "Authorization: Bearer lat_live_abc123..." https://lattice.app/api/v1/health
 *
 * Returns 200 with rate-limit headers and key metadata when healthy.
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticatePartner } from '@/lib/api/partnerAuth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await authenticatePartner(req);
  if (!auth.ok) return auth.response;

  return NextResponse.json({
    ok: true,
    service: 'Lattice OS Partner Gateway',
    version: 'v1',
    key: {
      id: auth.context.keyId,
      environment: auth.context.environment,
      scopes: auth.context.scopes,
      workspaceId: auth.context.workspaceId,
    },
    timestamp: new Date().toISOString(),
  });
}
