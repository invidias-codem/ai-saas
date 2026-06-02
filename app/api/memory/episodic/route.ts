import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/security/apiAuth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const authContext = await requireAuth();
    if (!authContext?.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId');

    // MOCK: Simulate semantic retrieval from Episodic Memory
    // In production, this would use a vector similarity search against the workspace's past episodes.
    await new Promise((resolve) => setTimeout(resolve, 800)); // Simulate query latency

    let suggestion = "";
    if (workspaceId) {
      suggestion = "Continue updating the Swagger docs for the new API refactor?";
    }

    return NextResponse.json({
      suggestion,
      source: 'episodic_memory',
    });
  } catch (error) {
    console.error('Failed to fetch episodic memory suggestion:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
