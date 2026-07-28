import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json().catch(() => null);
    if (!payload || typeof payload !== 'object') {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const record = (payload as any).record ?? payload;
    const {
      user_id,
      conversation_id,
      feature_type,
      model_id,
      total_tokens,
      tokens_in,
      tokens_out,
      intent_category,
      execution_mode,
      cost_estimate,
      created_at,
    } = record ?? {};

    const alertWebhook = process.env.OTEL_SLACK_WEBHOOK_URL;
    const threshold = Number(process.env.OTEL_TOKEN_ALERT_THRESHOLD ?? '20000');

    if (!alertWebhook || typeof total_tokens !== 'number' || total_tokens <= threshold) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const channelSuffix = process.env.OTEL_SLACK_CHANNEL ? `\n• Channel: ${process.env.OTEL_SLACK_CHANNEL}` : '';

    const lines = [
      '*High Token Task Alert*',
      `• User: ${user_id}`,
      `• Feature: ${feature_type}`,
      `• Model: ${model_id}`,
      `• Total tokens: ${total_tokens} (in: ${tokens_in}, out: ${tokens_out})`,
      `• Intent: ${intent_category ?? 'n/a'}`,
      `• Execution: ${execution_mode ?? 'n/a'}`,
      `• Cost estimate: ${cost_estimate ?? 'n/a'}`,
      `• Created: ${created_at}`,
      conversation_id ? `• Conversation: ${conversation_id}` : null,
      channelSuffix,
    ].filter(Boolean);

    const text = lines.join('\n');

    const res = await fetch(alertWebhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[OTel alert] Webhook failed', res.status, body);
      return NextResponse.json({ ok: false, status: res.status }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'alert error' }, { status: 500 });
  }
}
