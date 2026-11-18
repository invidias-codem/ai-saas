// Account Compute Plane — A3.4: durable guest workspace supervisor endpoint.
//
// Default-off via ENABLE_ACCOUNT_COMPUTE, ENABLE_ACCOUNT_COMPUTE_LIFECYCLE,
// and ENABLE_ACCOUNT_COMPUTE_GUEST_RUNTIME. Clerk-authenticated,
// server-verified workspace admission (membership + role), every operation
// bound to account + workspace through DB-backed leases and generation CAS.
// Provider operations are mocked until A3.3 runtime isolation is verified
// against a real Linux VM.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, handleAuthError, getClientIP } from '@/lib/security/apiAuth';
import { limitApiEndpoint } from '@/lib/security/rateLimit';
import {
  ENABLE_ACCOUNT_COMPUTE_LIFECYCLE,
  ENABLE_ACCOUNT_COMPUTE_GUEST_RUNTIME,
} from '@/lib/intelligence/execution/accountCompute/lifecycle';
import {
  ENABLE_ACCOUNT_COMPUTE,
  getAccountVm,
} from '@/lib/intelligence/execution/accountCompute/reservation';
import { DurableGuestSupervisor } from '@/lib/intelligence/execution/accountCompute/durableGuestSupervisor';
import { admitWorkspace } from '@/lib/intelligence/execution/accountCompute/admission';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const guestSchema = z.object({
  action: z.enum(['create', 'start', 'execute', 'suspend', 'destroy', 'health', 'inspect']),
  workspaceId: z.string().min(1).max(128),
  expectedGeneration: z.number().int().nonnegative().optional(),
  command: z.string().optional(),
});

const supervisor = new DurableGuestSupervisor(
  {
    id: 'mock-provider',
    createGuest: async () => ({ desktopId: `desktop-${crypto.randomUUID()}` }),
    startGuest: async () => undefined,
    suspendGuest: async () => undefined,
    destroyGuest: async () => undefined,
    healthGuest: async () => ({ healthy: true }),
    inspectGuest: async () => null,
  },
  {
    maxConcurrentGuests: 10,
    leaseTtlMs: 5 * 60 * 1000,
    leaseRenewalMs: 60_000,
  },
);

function isEnabled(): boolean {
  // All three flags must be explicitly enabled, and a real (non-mock)
  // provider must be qualified before any guest operation is served.
  return (
    ENABLE_ACCOUNT_COMPUTE === true &&
    ENABLE_ACCOUNT_COMPUTE_LIFECYCLE === true &&
    ENABLE_ACCOUNT_COMPUTE_GUEST_RUNTIME === true &&
    supervisor.provider.id !== 'mock-provider'
  );
}

async function handleError(error: unknown): Promise<NextResponse> {
  return handleAuthError(error);
}

/** Verify the caller's account has an authorized, ready VM before any guest op. */
async function requireAccountVm(ownerUserId: string): Promise<{
  ok: boolean;
  vm?: { desktopId: string | null; phase: string; generation: number };
  reason?: string;
}> {
  const vm = await getAccountVm(ownerUserId);
  if (!vm) {
    return { ok: false, reason: 'no account VM claim' };
  }
  if (String(vm.owner_user_id) !== ownerUserId) {
    return { ok: false, reason: 'account VM ownership mismatch' };
  }
  if (vm.state !== 'ready') {
    return { ok: false, reason: `account VM not ready (${vm.state})` };
  }
  return {
    ok: true,
    vm: { desktopId: vm.desktop_id ?? null, phase: vm.state, generation: vm.generation },
  };
}

export async function POST(req: Request): Promise<NextResponse> {
  if (!isEnabled()) {
    return NextResponse.json({ error: 'Guest compute is not enabled' }, { status: 503 });
  }

  try {
    const user = await requireAuth();
    const ip = getClientIP(req);

    const rl = await limitApiEndpoint(user.userId, ip, 'mutation');
    if (!rl.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const body = guestSchema.parse(await req.json());

    // Server-verified membership — never trust request JSON for identity.
    const admission = await admitWorkspace(user.userId, body.workspaceId);
    if (!admission.allowed) {
      return NextResponse.json({ error: admission.reason }, { status: 403 });
    }

    // Account VM ownership: caller must have an authorized, ready VM.
    const vmCheck = await requireAccountVm(user.userId);
    if (!vmCheck.ok) {
      return NextResponse.json({ error: vmCheck.reason }, { status: 403 });
    }

    const scope = {
      tenantId: `user:${user.userId}`,
      workspaceId: body.workspaceId,
    };

    switch (body.action) {
      case 'create': {
        const result = await supervisor.createWorkspaceGuest(
          user.userId,
          body.workspaceId,
          admission.workspaceNamespace!,
          scope,
          vmCheck.vm?.generation ?? body.expectedGeneration ?? 0,
        );
        if (!result.ok) {
          return NextResponse.json({ error: result.reason }, { status: 409 });
        }
        return NextResponse.json({ ok: true, state: result.state, generation: result.generation });
      }
      case 'start': {
        const result = await supervisor.startWorkspaceGuest(
          user.userId,
          body.workspaceId,
          scope,
          body.expectedGeneration ?? 0,
        );
        if (!result.ok) {
          return NextResponse.json({ error: result.reason }, { status: 409 });
        }
        return NextResponse.json({ ok: true, state: result.state, generation: result.generation });
      }
      case 'suspend': {
        const result = await supervisor.suspendWorkspaceGuest(
          user.userId,
          body.workspaceId,
          scope,
          body.expectedGeneration ?? 0,
        );
        if (!result.ok) {
          return NextResponse.json({ error: result.reason }, { status: 409 });
        }
        return NextResponse.json({ ok: true, state: result.state, generation: result.generation });
      }
      case 'destroy': {
        const result = await supervisor.destroyWorkspaceGuest(
          user.userId,
          body.workspaceId,
          body.expectedGeneration ?? 0,
        );
        if (!result.ok) {
          return NextResponse.json({ error: result.reason }, { status: 409 });
        }
        return NextResponse.json({ ok: true, generation: result.generation });
      }
      case 'health': {
        const result = await supervisor.healthWorkspaceGuest(
          user.userId,
          body.workspaceId,
          body.expectedGeneration ?? 0,
        );
        if (!result.ok) {
          return NextResponse.json({ error: result.reason }, { status: 409 });
        }
        return NextResponse.json({ ok: true, healthy: result.healthy, generation: result.generation });
      }
      case 'inspect': {
        const result = await supervisor.inspectWorkspaceGuest(
          user.userId,
          body.workspaceId,
          body.expectedGeneration ?? 0,
        );
        if (!result.ok) {
          return NextResponse.json({ error: result.reason }, { status: 409 });
        }
        return NextResponse.json({ ok: true, state: result.state, generation: result.generation });
      }
      case 'execute':
        return NextResponse.json({ error: 'execute not yet implemented' }, { status: 501 });
    }
  } catch (error) {
    return handleError(error);
  }
}
