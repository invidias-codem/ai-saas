import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseClient';

export const runtime = 'edge';

export async function GET() {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'unavailable' }, { status: 500 });
    }

    const { data, error } = await supabaseAdmin
      .from('ale_metrics_view')
      .select('*')
      .order('current_ale_usd', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message ?? 'query failed' }, { status: 500 });
    }

    return NextResponse.json({ success: true, metrics: data ?? [] });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? 'unknown error' },
      { status: 500 }
    );
  }
}
