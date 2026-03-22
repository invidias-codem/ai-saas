import { NextResponse } from 'next/server';
import { MctsResolverAgent } from '@/lib/ucol/agents/MctsResolverNode';
import { fetchFiles } from '@/lib/ucol/agents/codebaseExplorer';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  // Removed auth for local testing

  try {
    const mcts = new MctsResolverAgent(2, 2);
    
    const suspectedFiles = ['lib/env.ts', 'lib/supabaseClient.ts'];
    const files = await fetchFiles(suspectedFiles);

    const initialState = {
      filePaths: files.map((f: any) => f.path),
      fileContents: files.reduce((acc: any, f: any) => ({ ...acc, [f.path]: f.content }), {}),
      errorTrace: `Error: supabaseUrl is required. at module evaluation (.next/server/chunks/turbopack_runtime.js)`
    };

    const fix = await mcts.resolveError(initialState);
    
    return NextResponse.json({
      success: true,
      mcts_result: fix
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
