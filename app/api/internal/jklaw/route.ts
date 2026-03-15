/**
 * /api/internal/jklaw — JKlaw Internal Bridge
 *
 * Secure service-to-service endpoint for JKlaw (OpenClaw AI co-founder)
 * to interact with Tech Genie's conversation engine, knowledge graph, and memory.
 *
 * Auth: X-JKlaw-Key header must match JKLAW_API_KEY env var.
 *
 * Actions:
 *   - chat          → full conversation engine with JKlaw's context
 *   - memory-push   → store a fact in the knowledge graph
 *   - memory-query  → semantic search over JKlaw's stored facts
 *   - memory-delete → delete a memory entry by ID
 *   - status        → health check + available features
 */

import { NextResponse } from 'next/server';
import { generateConversationReply, ConversationRequestSchema } from '@/lib/llm/conversationEngine';
import { storeMemory, searchMemories, deleteMemory } from '@/lib/memory/vectorStore';
import { addNode } from '@/lib/memory/graphStore';
import { audit } from '@/lib/security/auditLog';

// ─── Auth ──────────────────────────────────────────────────────────────────
const JKLAW_USER_ID = 'jklaw-internal-agent';
const JKLAW_API_KEY = process.env.JKLAW_API_KEY;

function validateKey(req: Request): boolean {
    if (!JKLAW_API_KEY) return false;
    const key = req.headers.get('x-jklaw-key');
    return key === JKLAW_API_KEY;
}

// Minimal mock clerk user for internal calls
const JKLAW_CLERK_USER = {
    id: JKLAW_USER_ID,
    firstName: 'JKlaw',
    lastName: 'Agent',
    emailAddresses: [{ emailAddress: 'jklaw@internal.techgenie' }],
    primaryEmailAddressId: 'jklaw-email',
    imageUrl: '',
    createdAt: Date.now(),
};

/**
 * Pre-fetch JKlaw's knowledge graph facts and format them as a context block.
 *
 * Why: getRAGMemoryContext() filters by feature_type="conversation", which
 * excludes manually-pushed facts (they have no feature_type). This bypass
 * calls searchMemories() directly without the feature_type filter, ensuring
 * our curated knowledge graph is always injected into the context.
 */
async function buildJklawContext(query: string): Promise<string> {
    try {
        const memories = await searchMemories(JKLAW_USER_ID, query, 7);
        if (!memories || memories.length === 0) return '';

        const facts = memories
            .filter((m: any) => m.similarity > 0.55)
            .map((m: any) => `- ${m.content}`)
            .join('\n');

        if (!facts) return '';

        return `\n\n## JKlaw Knowledge Base (Internal Facts)\nThe following facts are from the JKlaw internal knowledge graph. Use them as authoritative context:\n${facts}\n`;
    } catch (e) {
        console.warn('[JKlaw] Context pre-fetch failed:', e);
        return '';
    }
}

// ─── POST /api/internal/jklaw ──────────────────────────────────────────────
export async function POST(req: Request) {
    if (!validateKey(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: any;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { action } = body;

    // ── status ────────────────────────────────────────────────────────────
    if (action === 'status') {
        return NextResponse.json({
            ok: true,
            agent: 'JKlaw',
            version: '1.2.0',
            features: ['chat', 'memory-push', 'memory-query', 'memory-delete', 'status'],
            timestamp: new Date().toISOString(),
        });
    }

    // ── chat ──────────────────────────────────────────────────────────────
    if (action === 'chat') {
        const { messages, prompt, stream: wantStream = false, userId: originatingUserId, _routingContext } = body;

        // Validate tenant scope — userId must be present in every dispatch
        if (!originatingUserId || typeof originatingUserId !== 'string') {
            console.error('[JKlaw] Dispatch rejected: missing userId (tenant scope violation)');
            return NextResponse.json({ error: 'Missing userId: tenant scope required for all dispatches' }, { status: 400 });
        }

        // Audit the agent dispatch with full tenant context
        void audit('agent.dispatch', originatingUserId, {
            targetNode: 'jklaw',
            taskType: _routingContext?.taskType,
            goalContext: _routingContext?.goalContext,
            confidence: _routingContext?.confidence,
        });

        if (!prompt && (!messages || messages.length === 0)) {
            return NextResponse.json({ error: 'prompt or messages required' }, { status: 400 });
        }

        const userQuery = prompt || messages?.at(-1)?.text || '';

        // Pre-fetch knowledge graph context, bypassing the feature_type filter
        // that would otherwise exclude our manually-pushed facts.
        const jklawContext = await buildJklawContext(userQuery);

        // Inject context directly into the user message so the engine sees it
        // regardless of its internal RAG pipeline.
        const enrichedPrompt = jklawContext
            ? `${jklawContext}\n\nQuestion: ${userQuery}`
            : userQuery;

        const requestPayload = {
            messages: [
                ...(messages?.slice(0, -1) || []),
                { role: 'user', text: enrichedPrompt },
            ],
        };

        const parsed = ConversationRequestSchema.safeParse(requestPayload);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
        }

        try {
            const result = await generateConversationReply(
                { userId: JKLAW_USER_ID, clerkUser: JKLAW_CLERK_USER, request: parsed.data },
                {
                    // Skip web research — our curated graph is the authoritative source.
                    skipWebResearch: true,
                    // Disable side effects so conversation responses don't
                    // pollute the knowledge graph. Memory is managed via memory-push only.
                    disableSideEffects: true,
                }
            );

            if (wantStream) {
                return new NextResponse(result.stream, {
                    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
                });
            }

            const reader = result.stream.getReader();
            const decoder = new TextDecoder();
            let text = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                text += decoder.decode(value, { stream: true });
            }

            return NextResponse.json({
                ok: true,
                response: text,
                model: result.debug?.model || 'unknown',
                timestamp: new Date().toISOString(),
            });
        } catch (err: any) {
            console.error('[JKlaw] chat error:', err);
            return NextResponse.json({ error: err.message || 'Chat failed' }, { status: 500 });
        }
    }

    // ── memory-push ───────────────────────────────────────────────────────
    if (action === 'memory-push') {
        const { fact, type = 'general', tags = [] } = body;

        if (!fact || typeof fact !== 'string') {
            return NextResponse.json({ error: 'fact string required' }, { status: 400 });
        }

        try {
            const memType = type === 'preference' ? 'preference' : 'fact';
            await storeMemory(JKLAW_USER_ID, fact, memType as any, { source: 'jklaw', tags });

            if (tags.length > 0) {
                for (const tag of tags.slice(0, 3)) {
                    await addNode(JKLAW_USER_ID, tag, 'concept', `JKlaw: ${fact.substring(0, 80)}`);
                }
            }

            return NextResponse.json({
                ok: true,
                stored: fact.substring(0, 100),
                timestamp: new Date().toISOString(),
            });
        } catch (err: any) {
            console.error('[JKlaw] memory-push error:', err);
            return NextResponse.json({ error: err.message || 'Memory push failed' }, { status: 500 });
        }
    }

    // ── memory-delete ─────────────────────────────────────────────────────
    if (action === 'memory-delete') {
        const { id, allowDestructiveActions } = body;

        if (!allowDestructiveActions) {
            return NextResponse.json({ 
                error: 'Forbidden: allowDestructiveActions flag is required for this operation (T-008)' 
            }, { status: 403 });
        }

        if (!id || typeof id !== 'string') {
            return NextResponse.json({ error: 'id required' }, { status: 400 });
        }

        try {
            const success = await deleteMemory(id, JKLAW_USER_ID);
            return NextResponse.json({ ok: success, id, timestamp: new Date().toISOString() });
        } catch (err: any) {
            console.error('[JKlaw] memory-delete error:', err);
            return NextResponse.json({ error: err.message || 'Delete failed' }, { status: 500 });
        }
    }

    // ── memory-query ──────────────────────────────────────────────────────
    if (action === 'memory-query') {
        const { query, limit = 5 } = body;

        if (!query || typeof query !== 'string') {
            return NextResponse.json({ error: 'query string required' }, { status: 400 });
        }

        try {
            const memories = await searchMemories(JKLAW_USER_ID, query, limit);

            return NextResponse.json({
                ok: true,
                query,
                results: memories,
                count: memories.length,
                timestamp: new Date().toISOString(),
            });
        } catch (err: any) {
            console.error('[JKlaw] memory-query error:', err);
            return NextResponse.json({ error: err.message || 'Memory query failed' }, { status: 500 });
        }
    }

    return NextResponse.json(
        { error: `Unknown action: ${action}. Valid: chat, memory-push, memory-query, memory-delete, status` },
        { status: 400 }
    );
}

// ─── GET /api/internal/jklaw (health ping) ────────────────────────────────
export async function GET(req: Request) {
    if (!validateKey(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ ok: true, agent: 'JKlaw', timestamp: new Date().toISOString() });
}
