/**
 * Partner webhook management (requires webhooks:manage scope on the partner key).
 *
 *   POST   /api/v1/webhooks          -> register a new webhook endpoint
 *   GET    /api/v1/webhooks          -> list webhooks for this key
 *   DELETE /api/v1/webhooks?id=UUID  -> deactivate a webhook
 *
 * Response includes signing_secret ONCE at creation (never retrievable again).
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticatePartner } from '@/lib/api/partnerAuth';
import { supabaseAdmin } from '@/lib/supabaseClient';
import { generateSigningSecret } from '@/lib/api/webhooks';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = await authenticatePartner(req, 'webhooks:manage');
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const { endpoint_url, events, description } = body ?? {};

  if (!endpoint_url || typeof endpoint_url !== 'string') {
    return NextResponse.json({ error: 'endpoint_url is required' }, { status: 400 });
  }

  // Basic URL validation
  try {
    const url = new URL(endpoint_url);
    if (url.protocol !== 'https:') {
      return NextResponse.json({ error: 'endpoint_url must use HTTPS' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'endpoint_url is not a valid URL' }, { status: 400 });
  }

  const requestedEvents: string[] = Array.isArray(events) ? events : [];

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Backend not configured' }, { status: 500 });
  }

  const signingSecret = generateSigningSecret();

  const { data, error } = await supabaseAdmin
    .from('partner_webhooks')
    .insert({
      key_id: auth.context.keyId,
      endpoint_url: endpoint_url.trim(),
      events: requestedEvents.length > 0 ? requestedEvents : ['*'],
      signing_secret: signingSecret,
      description: description ?? null,
    })
    .select('id, endpoint_url, events, active, description, created_at')
    .single();

  if (error || !data) {
    console.error('[webhooks POST] insert error:', error);
    return NextResponse.json({ error: 'Failed to create webhook' }, { status: 500 });
  }

  return NextResponse.json({
    webhook: data,
    signing_secret: signingSecret,
    warning: 'Store this signing secret securely. It will not be shown again.',
  });
}

export async function GET(req: NextRequest) {
  const auth = await authenticatePartner(req, 'webhooks:manage');
  if (!auth.ok) return auth.response;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Backend not configured' }, { status: 500 });
  }

  const { data, error } = await supabaseAdmin
    .from('partner_webhooks')
    .select('id, endpoint_url, events, active, description, created_at')
    .eq('key_id', auth.context.keyId)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: 'Failed to list webhooks' }, { status: 500 });
  }

  return NextResponse.json({ webhooks: data ?? [] });
}

export async function DELETE(req: NextRequest) {
  const auth = await authenticatePartner(req, 'webhooks:manage');
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id query param is required' }, { status: 400 });

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Backend not configured' }, { status: 500 });
  }

  const { error } = await supabaseAdmin
    .from('partner_webhooks')
    .update({ active: false })
    .eq('id', id)
    .eq('key_id', auth.context.keyId);

  if (error) {
    return NextResponse.json({ error: 'Failed to deactivate webhook' }, { status: 500 });
  }

  return NextResponse.json({ success: true, deactivated: id });
}
