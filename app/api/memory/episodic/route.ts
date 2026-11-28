import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/security/apiAuth';
import { LatentCodeSearchMcts } from '@/lib/ucol/mcts/latentCodeSearchMcts';
import { buildAstFromSource, type AstLanguage } from '@/lib/ucol/mcts/codeSearchMcts';

export const dynamic = 'force-dynamic';

/** Deterministic fallback when MCTS is unavailable or returns no action. */
const FALLBACK_SUGGESTION = 'Explore recent changes in this workspace';

/**
 * Map deterministic AST mutation kinds to human-readable predictive nudges.
 * These cover Stage 0/1 action kinds from codeSearchMcts.ts.
 */
const AST_ACTION_SUGGESTIONS: Record<string, string> = {
  'wrap-first-token': 'Refactor the top-level symbol in this file?',
  'append-noop-line': 'Add a TODO comment for the next pass?',
  'trim-trailing-brace': 'Clean up trailing braces in this file?',
  'replace_node': 'Apply a targeted replacement in this code?',
  'insert_before': 'Insert a new statement before this block?',
  'insert_after': 'Append a new statement after this block?',
  'delete_node': 'Remove the unused trailing block?',
};

function actionToSuggestion(action: { kind: string; description: string } | null): string {
  if (!action) return FALLBACK_SUGGESTION;

  // Exact kind match first.
  const byKind = AST_ACTION_SUGGESTIONS[action.kind];
  if (byKind) return byKind;

  // Fallback: prefix-match on description for staged expansions.
  const key = Object.keys(AST_ACTION_SUGGESTIONS).find((k) => action.description.startsWith(k));
  if (key) return AST_ACTION_SUGGESTIONS[key];

  return FALLBACK_SUGGESTION;
}

export async function GET(request: Request) {
  try {
    const authContext = await requireAuth();
    if (!authContext?.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId') || 'default';
    const source = searchParams.get('source') || '';
    const language = (searchParams.get('language') as AstLanguage) || 'typescript';

    let suggestion = FALLBACK_SUGGESTION;

    if (source) {
      try {
        const mcts = new LatentCodeSearchMcts({
          workspaceId,
          userId: authContext.userId,
          maxIterations: 8,
          maxDepth: 2,
          maxActionsPerNode: 3,
          historyK: 4,
          similarityThreshold: 0.55,
        });

        const rootState = {
          source,
          language,
          root: buildAstFromSource(source, language),
        };

        const result = await mcts.search(rootState);
        const bestAction = result.bestAction;
        suggestion = actionToSuggestion(bestAction ?? null);
      } catch (mctsErr) {
        console.warn('[episodic] MCTS search failed, using fallback suggestion', {
          error: (mctsErr as Error).message,
        });
        // Graceful degradation: return static suggestion instead of 500.
      }
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
