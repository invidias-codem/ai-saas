import { NextResponse } from 'next/server';
import { searchCodebaseTool } from '@/lib/agents/tools/searchCodebase';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const result = await searchCodebaseTool.execute(
      {
        query: 'synthetic test hello function',
        limit: 5,
        useMcts: true,
      },
      {} as any
    );

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: String(err),
      },
      { status: 500 }
    );
  }
}
