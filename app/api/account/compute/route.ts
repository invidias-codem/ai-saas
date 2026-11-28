// Account Compute Plane — A1: server-only status/ensure endpoint.
//
// Default-off via ENABLE_ACCOUNT_COMPUTE. No provider URLs or secrets leak
// through this endpoint. All writes go through service_role RPCs after
// Clerk-authenticated identity is established.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, handleAuthError, getClientIP } from '@/lib/security/apiAuth';
import { limitApiEndpoint } from '@/lib/security/rateLimit';
import {
  ENABLE_ACCOUNT_COMPUTE,
  claimAccountVm,
  getAccountVm,
  getWorkspaceBindings,
} from '@/lib/intelligence/execution/accountCompute/reservation';
import { accountVmReservationKey } from '@/lib/intelligence/execution/accountCompute/contracts';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const ensureSchema = z.object({
  vmClass: z.string().min(1).max(64).default('daytona-vm-small'),
});

function isEnabled(): boolean {
  return ENABLE_ACCOUNT_COMPUTE;
}

async function handleError(error: unknown): Promise<NextResponse> {
  return handleAuthError(error);
}

export async function GET(req: Request): Promise<NextResponse> {
  if (!isEnabled()) {
    return NextResponse.json({ error: 'Account compute is not enabled' }, { status: 503 });
  }

  try {
    const user = await requireAuth();
    const ip = getClientIP(req);

    const rl = await limitApiEndpoint(user.userId, ip, 'mutation');
    if (!rl.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const vm = await getAccountVm(user.userId);
    const bindings = await getWorkspaceBindings(user.userId);

    return NextResponse.json({
      enabled: true,
      vm: vm ?? null,
      workspaceBindings: bindings,
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  if (!isEnabled()) {
    return NextResponse.json({ error: 'Account compute is not enabled' }, { status: 503 });
  }

  try {
    const user = await requireAuth();
    const ip = getClientIP(req);

    const rl = await limitApiEndpoint(user.userId, ip, 'mutation');
    if (!rl.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const body = await req.json();
    const { vmClass } = ensureSchema.parse(body);

    const operationKey = accountVmReservationKey(user.userId);

    // Entitlement snapshot — verified against provider capabilities before
    // calling. For now a conservative default; A2 qualifies real VM sizes.
    const entitlement = {
      vcpus: 2,
      memoryMb: 4096,
      storageGb: 20,
      maxConcurrentWorkspaces: 10,
    };

    const claim = await claimAccountVm(
      user.userId,
      operationKey,
      vmClass,
      entitlement
    );

    return NextResponse.json({
      claimed: claim.claimed,
      replay: claim.replay,
      vmId: claim.vmId,
      state: claim.state,
      generation: claim.generation,
      operationKey: claim.operationKey,
    });
  } catch (error) {
    return handleError(error);
  }
}
