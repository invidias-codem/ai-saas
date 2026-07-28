import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, getClientIP } from '@/lib/security/apiAuth';
import { limitApiEndpoint } from '@/lib/security/rateLimit';
import { supabaseAdmin } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await requireAuth().catch(() => null);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const ip = getClientIP(req);
    const rateLimit = await limitApiEndpoint(user.userId, ip, 'query');
    if (!rateLimit.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const { searchParams } = new URL(req.url);
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10) || 50, 1), 200);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10) || 0, 0);
    const orderBy = searchParams.get('order') || 'created_at';
    const sortDir = searchParams.get('dir') === 'asc' ? 'asc' : 'desc';
    const ranked = searchParams.get('ranked') === 'true';

    if (!supabaseAdmin) {
      return NextResponse.json({ success: true, metrics: [] });
    }

    if (ranked) {
      const { data, error } = await supabaseAdmin
        .from('task_token_metrics')
        .select('model_id, feature_type, provider, intent_category, execution_mode, total_tokens, tokens_in, tokens_out, latency_ms, created_at')
        .eq('user_id', user.userId)
        .order('total_tokens', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('[OTel] ranked task_token_metrics query failed:', error);
        return NextResponse.json({ success: true, metrics: [] });
      }

      const rankedMetrics = (data ?? []).map((metric: any) => ({
        ...metric,
        rank: data.indexOf(metric) + 1,
      }));

      return NextResponse.json({ success: true, metrics: rankedMetrics });
    }

    const { data, error } = await supabaseAdmin
      .from('task_token_metrics')
      .select('*')
      .eq('user_id', user.userId)
      .order(orderBy, { ascending: sortDir === 'asc' })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('[OTel] task_token_metrics query failed:', error);
      return NextResponse.json({ success: true, metrics: [] });
    }

    return NextResponse.json({ success: true, metrics: data ?? [] });
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to load token metrics', details: err?.message ?? 'unknown error' }, { status: 500 });
  }
}
