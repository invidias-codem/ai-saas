// app/api/admin/referrals/route.ts
// Admin-only endpoint for referral dashboard data.
// Protected by ADMIN_SECRET header.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseClient';

function isAdminAuthorized(req: NextRequest): boolean {
  const secret = req.headers.get('x-admin-secret');
  return secret === process.env.ADMIN_SECRET;
}

// GET /api/admin/referrals — summary for all creators
// GET /api/admin/referrals?code=kj_chen — detail for one creator
export async function GET(req: NextRequest) {
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'DB unavailable' }, { status: 500 });
  }

  const code = req.nextUrl.searchParams.get('code');

  if (code) {
    // ── Single creator detail ──────────────────────────────────────────────
    const [summaryRes, eventsRes, payoutsRes] = await Promise.all([
      supabaseAdmin
        .from('referral_summary')
        .select('*')
        .eq('code', code)
        .single(),

      supabaseAdmin
        .from('referral_events')
        .select('*')
        .eq('code', code)
        .order('created_at', { ascending: false })
        .limit(100),

      supabaseAdmin
        .from('referral_payouts')
        .select('*')
        .eq('code', code)
        .order('period_start', { ascending: false }),
    ]);

    return NextResponse.json({
      summary:  summaryRes.data,
      events:   eventsRes.data,
      payouts:  payoutsRes.data,
    });

  } else {
    // ── All creators summary ───────────────────────────────────────────────
    const { data: summary, error } = await supabaseAdmin
      .from('referral_summary')
      .select('*')
      .order('total_signups', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ creators: summary });
  }
}

// POST /api/admin/referrals — create a new referral code
export async function POST(req: NextRequest) {
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'DB unavailable' }, { status: 500 });
  }

  const body = await req.json();
  const { code, creator_handle, creator_name, email, paypal_email, track, bonus_multiplier } = body;

  if (!code || !creator_handle || !email) {
    return NextResponse.json({ error: 'code, creator_handle, and email are required' }, { status: 400 });
  }

  // Normalize code: lowercase, no spaces
  const normalizedCode = code.toLowerCase().replace(/\s+/g, '_');

  const { data, error } = await supabaseAdmin
    .from('referral_codes')
    .insert({
      code:             normalizedCode,
      creator_handle,
      creator_name:     creator_name || creator_handle,
      email,
      paypal_email:     paypal_email || null,
      track:            track || 'creator',
      bonus_multiplier: bonus_multiplier || 1.0,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Code already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success:      true,
    creator:      data,
    referral_url: `https://gen1e.xyz?ref=${normalizedCode}`,
  });
}

// PATCH /api/admin/referrals — update a code (e.g. deactivate, change multiplier)
export async function PATCH(req: NextRequest) {
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'DB unavailable' }, { status: 500 });
  }

  const body = await req.json();
  const { code, ...updates } = body;

  if (!code) {
    return NextResponse.json({ error: 'code is required' }, { status: 400 });
  }

  // Whitelist updatable fields
  const allowed = ['is_active', 'bonus_multiplier', 'paypal_email', 'notes'];
  const filtered = Object.fromEntries(
    Object.entries(updates).filter(([k]) => allowed.includes(k))
  );

  const { data, error } = await supabaseAdmin
    .from('referral_codes')
    .update(filtered)
    .eq('code', code)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, creator: data });
}
