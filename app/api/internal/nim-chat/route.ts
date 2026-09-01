// app/api/internal/nim-chat/route.ts
// Internal proxy for NVIDIA NIM chat completions.
// This route exists to reuse Vercel's warm egress/TLS connections,
// eliminate DNS/TLS tax on every cold serverless request, and add
// first-class latency telemetry around the upstream NIM call.
//
// Only callable from the same Vercel project; no external auth.
import { NextResponse } from 'next/server';
import { nvidiaNimConfig } from '@/lib/env';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface NimChatRequestBody {
  messages: Array<{ role: string; content: string }>;
  model?: string;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stream?: boolean;
  chat_template_kwargs?: Record<string, unknown>;
  reasoning_effort?: string;
}

export async function POST(req: Request) {
  const cfg = nvidiaNimConfig();
  if (!cfg) {
    return NextResponse.json(
      { error: 'NVIDIA_API_KEY is not configured on the server.' },
      { status: 500 }
    );
  }

  let body: NimChatRequestBody;
  try {
    body = (await req.json()) as NimChatRequestBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const modelId = body.model || 'moonshotai/kimi-k3';
  const upstreamBody: Record<string, unknown> = {
    model: modelId,
    messages: body.messages,
    max_tokens: body.max_tokens ?? 8192,
    temperature: body.temperature ?? 0.7,
    top_p: body.top_p ?? 0.95,
    stream: false,
  };
  if (body.chat_template_kwargs) upstreamBody.chat_template_kwargs = body.chat_template_kwargs;
  if (body.reasoning_effort) upstreamBody.reasoning_effort = body.reasoning_effort;

  const started = Date.now();
  let upstreamStatus = 'error';
  let upstreamLatencyMs: number | undefined;

  let response: Response;
  try {
    response = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify(upstreamBody),
    });
  } catch (err: any) {
    upstreamLatencyMs = Date.now() - started;
    logger.error('[nim-chat] upstream fetch failed', {
      model: modelId,
      latencyMs: upstreamLatencyMs,
      error: err?.message || String(err),
    });
    return NextResponse.json(
      {
        error: 'NIM upstream fetch failed.',
        details: err?.message || String(err),
        _telemetry: { model: modelId, upstreamLatencyMs, upstreamStatus: 'network_error' },
      },
      { status: 502 }
    );
  }

  upstreamLatencyMs = Date.now() - started;
  upstreamStatus = response.ok ? 'ok' : 'http_error';

  logger.info('[nim-chat] upstream response', {
    model: modelId,
    status: response.status,
    upstreamLatencyMs,
    upstreamStatus,
  });

  // Bubble up the raw NIM response so callers see exact errors
  const text = await response.text();
  const contentType = response.headers.get('content-type') || 'application/json';

  return new NextResponse(text, {
    status: response.status,
    headers: { 'content-type': contentType, 'x-nim-upstream-latency-ms': String(upstreamLatencyMs) },
  });
}
