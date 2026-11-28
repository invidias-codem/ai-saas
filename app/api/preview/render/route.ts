// Legacy executable HTML/JS preview has been retired.
// Serving generated code from the authenticated Lattice origin allowed
// direct navigation to execute code with the application's origin.
// New previews must use /api/preview/sandbox (isolated Vercel Sandbox).
// See security issue #479 for ingress authorization before public sharing.
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function retired() {
  return NextResponse.json(
    { error: 'Legacy preview rendering is disabled. Use an isolated Code Builder sandbox.' },
    {
      status: 410,
      headers: {
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    }
  );
}

export async function GET() { return retired(); }
export async function POST() { return retired(); }
