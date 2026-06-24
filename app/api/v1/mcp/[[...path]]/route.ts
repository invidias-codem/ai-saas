import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { handleRequest } from '@lattice-os/mcp-remote';
import { getClientIP } from '@/lib/security/apiAuth';
import { limitApiEndpoint } from '@/lib/security/rateLimit';

export const dynamic = 'force-dynamic';

function buildResShim() {
  let statusCode = 200;
  const headers: Record<string, string> = {};
  let responseBody = '';
  let finished = false;

  const resShim: any = {
    get statusCode() { return statusCode; },
    set statusCode(v: number) { statusCode = v; },
    setHeader(k: string, v: string) {
      headers[k.toLowerCase()] = String(v);
    },
    getHeader(k: string) {
      return headers[k.toLowerCase()] || null;
    },
    getHeaders() {
      return { ...headers };
    },
    writeHead(s: number, h?: Record<string, string>) {
      statusCode = s;
      if (h) Object.entries(h).forEach(([k, v]) => headers[k.toLowerCase()] = String(v));
    },
    write(chunk: string) {
      responseBody += chunk;
      return true;
    },
    end(chunk?: string) {
      if (chunk) responseBody += chunk;
      finished = true;
    },
    get writableEnded() {
      return finished;
    },
  };

  return { resShim, statusCode, headers, responseBody, finished };
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rateLimit = await limitApiEndpoint(userId, getClientIP(req), 'ai');
  if (!rateLimit.success) {
    return NextResponse.json(
      { error: 'Too many requests', message: 'MCP request rate limit exceeded. Please wait before trying again.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil((rateLimit.reset - Date.now()) / 1000)),
          'X-RateLimit-Limit': String(rateLimit.limit),
          'X-RateLimit-Remaining': String(rateLimit.remaining),
          'X-RateLimit-Reset': String(rateLimit.reset),
        },
      }
    );
  }

  const body = await req.json();
  const { resShim } = buildResShim();

  try {
    await handleRequest(req as any, resShim, body);
  } catch (e: any) {
    return NextResponse.json({ error: 'MCP transport error', detail: e?.message }, { status: 500 });
  }

  const nextRes = new NextResponse(resShim.responseBody, { status: resShim.statusCode });
  (Object.entries(resShim.headers) as [string, string][]).forEach(([k, v]) => nextRes.headers.set(k, v));
  return nextRes;
}

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rateLimit = await limitApiEndpoint(userId, getClientIP(req), 'ai');
  if (!rateLimit.success) {
    return NextResponse.json(
      { error: 'Too many requests', message: 'MCP request rate limit exceeded. Please wait before trying again.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil((rateLimit.reset - Date.now()) / 1000)),
          'X-RateLimit-Limit': String(rateLimit.limit),
          'X-RateLimit-Remaining': String(rateLimit.remaining),
          'X-RateLimit-Reset': String(rateLimit.reset),
        },
      }
    );
  }

  const { resShim } = buildResShim();

  try {
    await handleRequest(req as any, resShim, undefined);
  } catch (e: any) {
    return NextResponse.json({ error: 'MCP transport error', detail: e?.message }, { status: 500 });
  }

  const nextRes = new NextResponse(resShim.responseBody, { status: resShim.statusCode });
  (Object.entries(resShim.headers) as [string, string][]).forEach(([k, v]) => nextRes.headers.set(k, v));
  return nextRes;
}
