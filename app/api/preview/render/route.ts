// app/api/preview/render/route.ts
// Renders a preview session as an HTML document with strict CSP headers.
// Mobile-first: viewport meta, responsive container, orientation-aware.

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { supabaseAdmin } from '@/lib/supabaseClient';
import { setupUcolSession } from '@/lib/ucol/sessionHandler';
import { spendCreditsAtomic, hasUnlimitedUsageAccess, refundCredits, CREDIT_COSTS } from '@/lib/credits';
export const dynamic = 'force-dynamic';
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

const CSP_HEADER = [
  "default-src 'none'",
  "script-src 'unsafe-inline' 'unsafe-eval' https: https://static.cloudflareinsights.com",
  "style-src 'unsafe-inline' https:",
  "img-src data: https:",
  "font-src https:",
  "connect-src https:",
  "frame-ancestors 'self'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

const HTML_TEMPLATE = (code: string, language: string, sessionId: string) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <meta name="theme-color" content="#0a0a0a">
  <title>Lattice OS Preview</title>
  <style>
    :root {
      --safe-top: env(safe-area-inset-top, 0px);
      --safe-bottom: env(safe-area-inset-bottom, 0px);
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      height: 100%;
      background: #0a0a0a;
      color: #e5e5e5;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
      overflow: hidden;
      touch-action: manipulation;
    }
    #preview-host {
      width: 100%;
      height: 100%;
      height: 100dvh;
      padding-top: var(--safe-top);
      padding-bottom: var(--safe-bottom);
    }
    #preview-host:empty::before {
      content: 'Preview ready';
      display: block;
      padding: 16px;
      opacity: 0.7;
    }
  </style>
</head>
<body>
  <div id="preview-host"></div>
  <script>
    (function() {
      try {
        const host = document.getElementById('preview-host');
        const lang = ${JSON.stringify(language)};
        const raw = ${JSON.stringify(code)};
        if (lang === 'html') {
          host.innerHTML = raw;
        } else if (lang === 'javascript' || lang === 'typescript') {
          const script = document.createElement('script');
          script.type = 'text/javascript';
          script.textContent = raw;
          document.body.appendChild(script);
        } else if (lang === 'css') {
          const style = document.createElement('style');
          style.textContent = raw;
          document.head.appendChild(style);
        } else if (lang === 'react') {
          const script = document.createElement('script');
          script.type = 'text/javascript';
          script.textContent = raw;
          document.body.appendChild(script);
        } else {
          host.textContent = raw;
        }
      } catch (e) {
        document.getElementById('preview-host').textContent = 'Preview error: ' + (e && e.message ? e.message : String(e));
      }
    })();
  </script>
</body>
</html>`;

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('id') || req.nextUrl.searchParams.get('session_id');
  if (!sessionId) {
    return new NextResponse('Missing preview session id', { status: 400 });
  }

  try {
    assertSupabase();
    const { data, error } = await sb()
      .from('preview_sessions')
      .select('id, code, language, status, expires_at, user_id')
      .eq('id', sessionId)
      .maybeSingle();

    if (error) {
      console.error('[Preview:Render] DB error:', error);
      return new NextResponse('Preview lookup failed', { status: 500 });
    }

    if (!data) {
      return new NextResponse('Preview not found', { status: 404 });
    }

    if (data.status === 'expired' || data.status === 'failed') {
      return new NextResponse(`Preview ${data.status}`, { status: 410 });
    }

    if (new Date(data.expires_at).getTime() < Date.now()) {
      await sb()
        .from('preview_sessions')
        .update({ status: 'expired' })
        .eq('id', data.id);
      return new NextResponse('Preview expired', { status: 410 });
    }

    const html = HTML_TEMPLATE(data.code, data.language, data.id);
    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': CSP_HEADER,
        'X-Frame-Options': 'SAMEORIGIN',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: any) {
    return new NextResponse('Preview render failed', { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await setupUcolSession({
      req,
      maxRequestSizeBytes: 1 * 1024 * 1024,
      surface: 'api',
      strictValidation: true,
    });
    if (session.errorResponse) return session.errorResponse;

    const body = session.body ?? await req.json().catch(() => ({}));
    const code = typeof body.code === 'string' ? body.code : '';
    const language = ['html', 'javascript', 'typescript', 'css', 'react', 'sh', 'python'].includes(body.language) ? body.language : 'html';

    if (!code) {
      return NextResponse.json({ error: 'code is required' }, { status: 400 });
    }

    assertSupabase();

    const userId = session.user.userId;
    const idempotencyKey = req.headers.get('idempotency-key') || `preview-${userId}-${randomUUID()}`;
    const cost = CREDIT_COSTS.PREVIEW_RENDER;

    const isUnlimited = await hasUnlimitedUsageAccess(userId);
    let spendResult: { success: boolean; duplicate: boolean; remaining: number; error?: string } | null = null;
    if (!isUnlimited) {
      spendResult = await spendCreditsAtomic(userId, cost, idempotencyKey, 'Preview render');
      if (!spendResult.success && !spendResult.duplicate) {
        return NextResponse.json(
          {
            error: 'Insufficient credits',
            message: `You need ${cost} credits for this preview.`,
            remaining: spendResult.remaining,
          },
          { status: 402 }
        );
      }
    }

    const id = randomUUID();
    const { data, error } = await sb()
      .from('preview_sessions')
      .insert({
        id,
        user_id: userId,
        tenant_id: session.resolvedContext?.workspaceId || userId,
        code,
        language,
        status: 'ready',
        rendered_output: null,
      })
      .select('id')
      .single();

    if (error || !data) {
      if (!isUnlimited && spendResult && !spendResult.duplicate) {
        void refundCredits(userId, cost, 'Refund for failed preview session creation');
      }
      console.error('[Preview:Render] Insert failed:', error, { userId, cost, spendResult, codeLength: code.length, language });
      const supabaseDetails = error?.details || error?.message || error?.code || JSON.stringify(error);
      const responseDetails = `Supabase insert failed: ${supabaseDetails}`;
      return NextResponse.json({ error: responseDetails, details: supabaseDetails, userId, codeLength: code.length, language }, { status: 500 });
    }

    const previewUrl = `/api/preview/render?id=${data.id}`;
    return NextResponse.json({ id: data.id, previewUrl }, { status: 201 });
  } catch (error: any) {
    console.error('[Preview:Render] POST failed:', error);
    return NextResponse.json({ error: 'Internal Server Error', details: error?.message || 'unknown error' }, { status: 500 });
  }
}
