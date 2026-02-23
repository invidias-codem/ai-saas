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
 *   - status        → health check + available features
 */

import { NextResponse } from 'next/server';
import { generateConversationReply, ConversationRequestSchema } from '@/lib/llm/conversationEngine';
import { storeMemory, searchMemories } from '@/lib/memory/vectorStore';
import { addNode } from '@/lib/memory/graphStore';

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
            version: '1.0.0',
            features: ['chat', 'memory-push', 'memory-query', 'status'],
            timestamp: new Date().toISOString(),
        });
    }

    // ── chat ──────────────────────────────────────────────────────────────
    if (action === 'chat') {
        const { messages, prompt, stream: wantStream = false } = body;

        if (!prompt && (!messages || messages.length === 0)) {
            return NextResponse.json({ error: 'prompt or messages required' }, { status: 400 });
        }

        const requestPayload = {
            messages: [...(messages || []), { role: 'user', text: prompt || messages.at(-1)?.text }],
        };

        const parsed = ConversationRequestSchema.safeParse(requestPayload);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
        }

        try {
            const result = await generateConversationReply(
                { userId: JKLAW_USER_ID, clerkUser: JKLAW_CLERK_USER, request: parsed.data },
                {}
            );

            if (wantStream) {
                return new NextResponse(result.stream, {
                    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
                });
            }

            // Accumulate stream for non-streaming response
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
            // Store in vector store for RAG (type must be MemoryType)
            const memType = type === 'preference' ? 'preference' : type === 'fact' ? 'fact' : 'fact';
            await storeMemory(JKLAW_USER_ID, fact, memType as any, { source: 'jklaw', tags });

            // Also add as a knowledge graph node
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
        { error: `Unknown action: ${action}. Valid: chat, memory-push, memory-query, status` },
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
