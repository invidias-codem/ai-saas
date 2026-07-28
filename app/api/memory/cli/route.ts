import { NextRequest, NextResponse } from 'next/server';
import { listMemories, storeMemory } from '@/lib/memory/vectorStore';

export const dynamic = 'force-dynamic';

const LATTICE_CLI_TOKEN = process.env.LATTICE_CLI_TOKEN || '';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  const provided = authHeader.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length).trim()
    : null;

  if (!LATTICE_CLI_TOKEN || !provided || provided !== LATTICE_CLI_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId =
    req.headers.get('x-lattice-user-id') ||
    req.nextUrl.searchParams.get('userId');

  if (!userId) {
    return NextResponse.json({ error: 'Missing x-lattice-user-id or userId' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);

  try {
    const memories = await listMemories(userId, limit, 0);
    return NextResponse.json({ memories, total: memories.length });
  } catch {
    return NextResponse.json({ memories: [] });
  }
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  const provided = authHeader.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length).trim()
    : null;

  if (!LATTICE_CLI_TOKEN || !provided || provided !== LATTICE_CLI_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId =
    req.headers.get('x-lattice-user-id') ||
    (await req.json().catch(() => ({}))).userId;

  if (!userId) {
    return NextResponse.json({ error: 'Missing x-lattice-user-id or userId' }, { status: 401 });
  }

  const body = await req.json();
  const { content, type, metadata } = body ?? {};

  if (!content || typeof content !== 'string') {
    return NextResponse.json({ error: 'content is required' }, { status: 400 });
  }

  try {
    const id = await storeMemory(userId, content, type || 'fact', metadata ?? {}, { scope: 'user' });
    return NextResponse.json({ success: true, id });
  } catch {
    return NextResponse.json({ error: 'Failed to store memory' }, { status: 500 });
  }
}
