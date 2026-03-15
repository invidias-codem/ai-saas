/**
 * POST /api/internal/route-to-jklaw
 * 
 * UCOL router endpoint — classify a query and dispatch to JKlaw if appropriate.
 * Secured with JKLAW_API_KEY (same key as the bridge endpoint).
 * 
 * Used by the conversationEngine to augment responses with JKlaw context
 * when the query is classified as research, strategy, or orchestration.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAgentRouter } from '@/lib/ucol/agentRouter';

const RouteToJklawSchema = z.object({
    query: z.string().min(1).max(50000),
    context: z.any().optional(),
    preferSpeed: z.boolean().optional(),
    requireOrchestration: z.boolean().optional(),
    classifyOnly: z.boolean().optional(),
    userId: z.string().min(1).optional(),            // T-006 tenant scoping
    allowDestructiveActions: z.boolean().optional(), // T-008 Approval gate flag
});

function validateKey(req: Request): boolean {
    const key = process.env.JKLAW_API_KEY;
    if (!key) return false;
    return req.headers.get('x-jklaw-key') === key;
}

export async function POST(req: Request) {
    if (!validateKey(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let rawBody: unknown;
    try {
        rawBody = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const parsed = RouteToJklawSchema.safeParse(rawBody);
    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Invalid request', details: parsed.error.flatten() },
            { status: 400 }
        );
    }
    const { query, context, preferSpeed, requireOrchestration, classifyOnly, userId, allowDestructiveActions } = parsed.data;

    if (!userId || typeof userId !== 'string') {
        return NextResponse.json({ error: 'userId required for tenant scoping' }, { status: 400 });
    }

    try {
        const router = getAgentRouter();

        // Just classify — caller decides whether to dispatch
        if (classifyOnly) {
            const decision = await router.classify({ query, context, preferSpeed, requireOrchestration, userId, allowDestructiveActions });
            return NextResponse.json({ ok: true, decision, timestamp: new Date().toISOString() });
        }

        // Full route + execute
        const result = await router.route({ query, context, preferSpeed, requireOrchestration, userId, allowDestructiveActions });

        return NextResponse.json({
            ok: true,
            taskType: result.decision.taskType,
            targetNode: result.decision.targetNode,
            confidence: result.decision.confidence,
            reasoning: result.decision.reasoning,
            response: result.response,
            dispatched: result.dispatched ?? false,
            error: result.error,
            timestamp: new Date().toISOString(),
        });
    } catch (err: any) {
        console.error('[route-to-jklaw] Error:', err);
        return NextResponse.json({ error: err.message || 'Routing failed' }, { status: 500 });
    }
}
