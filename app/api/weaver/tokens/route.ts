// app/api/weaver/tokens/route.ts
// Issues tenant-scoped CLI tokens for Weaver onboarding.
// Requires user auth via Clerk/session handler.

import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { randomBytes, createHash } from 'crypto';
import { supabaseAdmin } from '@/lib/supabaseClient';
import { setupUcolSession } from '@/lib/ucol/sessionHandler';

export const runtime = 'nodejs';

function assertSupabase() {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client is not configured');
  }
}

function sb() {
  assertSupabase();
  return supabaseAdmin!;
}

async function hashToken(token: string): Promise<string> {
  return createHash('sha256').update(token).digest('hex');
}

export async function POST(req: Request) {
  try {
    const session = await setupUcolSession({
      req,
      maxRequestSizeBytes: 1 * 1024 * 1024,
      surface: 'api',
      strictValidation: true,
    });
    if (session.errorResponse) return session.errorResponse;

    const { user } = session;
    const body = await req.json().catch(() => ({}));
    const label = typeof body.label === 'string' ? body.label.slice(0, 120) : 'default';

    assertSupabase();

    const entropy = randomBytes(32).toString('hex');
    const rawToken = `lat_live_${entropy}`;
    const tokenHash = await hashToken(rawToken);
    const tokenId = randomUUID();

    const tenantId = session.resolvedContext?.workspaceId || user.userId;

    const { error } = await sb()
      .from('tenant_cli_tokens')
      .insert({
        id: tokenId,
        tenant_id: tenantId,
        user_id: user.userId,
        token_hash: tokenHash,
        label,
        revoked: false,
      });

    if (error) {
      return NextResponse.json(
        { error: 'Failed to issue token', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        token: rawToken,
        tokenId,
        tenantId,
        label,
        hint: 'Store this securely. It will not be shown again.',
      },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        details: error?.message || 'unknown error',
      },
      { status: 500 }
    );
  }
}
