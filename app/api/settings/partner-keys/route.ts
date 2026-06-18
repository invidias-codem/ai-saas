/**
 * Partner API key management (Clerk-authed dashboard endpoint).
 *
 *   POST   /api/settings/partner-keys   -> create a new key (returns plaintext ONCE)
 *   GET    /api/settings/partner-keys   -> list keys for the user's workspaces (no plaintext)
 *   DELETE /api/settings/partner-keys   -> revoke a key by id
 *
 * These are management operations protected by the normal Clerk session, NOT
 * by partner keys. The /api/v1/* gateway is what consumes the generated keys.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabaseClient';
import { generatePartnerKey, PARTNER_SCOPES, type KeyEnvironment } from '@/lib/api/partnerKeys';

export const dynamic = 'force-dynamic';

// ----- Create -----
export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!supabaseAdmin) return NextResponse.json({ error: 'Backend not configured' }, { status: 500 });

    const body = await req.json();
    const { workspaceId, name, environment, scopes, rateLimitPerMin } = body ?? {};

    if (!workspaceId || typeof workspaceId !== 'string') {
      return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 });
    }
    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    const env: KeyEnvironment = environment === 'live' ? 'live' : 'test';

    // Validate scopes against the allowlist
    const requestedScopes: string[] = Array.isArray(scopes) ? scopes : [];
    const invalidScopes = requestedScopes.filter((s) => !PARTNER_SCOPES.includes(s as any));
    if (invalidScopes.length > 0) {
      return NextResponse.json(
        { error: `Invalid scopes: ${invalidScopes.join(', ')}` },
        { status: 400 }
      );
    }

    // Verify the user owns the workspace
    const { data: ws, error: wsErr } = await supabaseAdmin
      .from('workspaces')
      .select('id')
      .eq('id', workspaceId)
      .eq('user_id', userId)
      .single();

    if (wsErr || !ws) {
      return NextResponse.json({ error: 'Forbidden: workspace not found or not owned' }, { status: 403 });
    }

    // Generate the key
    const generated = generatePartnerKey(env);

    const { data: inserted, error: insErr } = await supabaseAdmin
      .from('partner_keys')
      .insert({
        workspace_id: workspaceId,
        user_id: userId,
        name,
        key_prefix: generated.prefix,
        key_hash: generated.hash,
        environment: env,
        scopes: requestedScopes.length > 0 ? requestedScopes : ['memory:write', 'query:read', 'stream:read'],
        rate_limit_per_min: typeof rateLimitPerMin === 'number' ? rateLimitPerMin : 100,
      })
      .select('id, name, key_prefix, environment, scopes, rate_limit_per_min, created_at')
      .single();

    if (insErr || !inserted) {
      console.error('[partner-keys] insert error:', insErr);
      return NextResponse.json({ error: 'Failed to create key' }, { status: 500 });
    }

    // Return plaintext ONCE — never retrievable again
    return NextResponse.json({
      key: generated.plaintext,
      keyInfo: inserted,
      warning: 'Store this key securely. It will not be shown again.',
    });
  } catch (err) {
    console.error('[partner-keys POST]', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// ----- List -----
export async function GET(_req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!supabaseAdmin) return NextResponse.json({ error: 'Backend not configured' }, { status: 500 });

    const { data, error } = await supabaseAdmin
      .from('partner_keys')
      .select('id, workspace_id, name, key_prefix, environment, scopes, rate_limit_per_min, revoked, last_used_at, expires_at, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[partner-keys] list error:', error);
      return NextResponse.json({ error: 'Failed to list keys' }, { status: 500 });
    }

    return NextResponse.json({ keys: data ?? [] });
  } catch (err) {
    console.error('[partner-keys GET]', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// ----- Revoke -----
export async function DELETE(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!supabaseAdmin) return NextResponse.json({ error: 'Backend not configured' }, { status: 500 });

    const { searchParams } = new URL(req.url);
    const keyId = searchParams.get('id');
    if (!keyId) return NextResponse.json({ error: 'id query param is required' }, { status: 400 });

    // Only revoke keys owned by this user
    const { error } = await supabaseAdmin
      .from('partner_keys')
      .update({ revoked: true })
      .eq('id', keyId)
      .eq('user_id', userId);

    if (error) {
      console.error('[partner-keys] revoke error:', error);
      return NextResponse.json({ error: 'Failed to revoke key' }, { status: 500 });
    }

    return NextResponse.json({ success: true, revoked: keyId });
  } catch (err) {
    console.error('[partner-keys DELETE]', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
