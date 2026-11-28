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
import { env } from '@/lib/env';
import { abortableStream, withAbort } from '@/lib/runtime/abort';
import { encodeProviderErrorEvent } from '@/lib/media/envelope';

export const maxDuration = 300;
const CHAT_BUDGET_MS = 240_000;
const CONTEXT_BUDGET_MS = 5_000;

// ─── Auth ──────────────────────────────────────────────────────────────────
const JKLAW_USER_ID = 'jklaw-internal-agent';
const JKLAW_API_KEY = env.JKLAW_API_KEY;

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

        const deadline = new AbortController();
        const signal = AbortSignal.any([req.signal, deadline.signal]);
        const timer = setTimeout(() => deadline.abort(new DOMException('JKlaw chat deadline exceeded', 'TimeoutError')), CHAT_BUDGET_MS);
        const startedAt = Date.now();
        const requestId = crypto.randomUUID();
        let stage = 'context';
        let streaming = false;

        try {
            signal.throwIfAborted();
            const contextDeadline = new AbortController();
            const contextTimer = setTimeout(() => contextDeadline.abort(new DOMException('Context deadline exceeded', 'TimeoutError')), CONTEXT_BUDGET_MS);
            let jklawContext = '';
            try {
                jklawContext = await withAbort(buildJklawContext(userQuery), AbortSignal.any([signal, contextDeadline.signal]));
            } catch {
                signal.throwIfAborted();
                console.warn('[JKlaw] Context deadline exceeded; continuing without retrieved facts', { requestId });
            } finally {
                clearTimeout(contextTimer);
            }

            const enrichedPrompt = jklawContext ? `${jklawContext}\n\nQuestion: ${userQuery}` : userQuery;
            const parsed = ConversationRequestSchema.safeParse({
                messages: [...(messages?.slice(0, -1) || []), { role: 'user', text: enrichedPrompt }],
            });
            if (!parsed.success) {
                return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
            }

            stage = 'generation';
            const pendingResult = generateConversationReply(
                { userId: JKLAW_USER_ID, clerkUser: JKLAW_CLERK_USER, request: parsed.data },
                {
                    // Skip web research — our curated graph is the authoritative source.
                    skipWebResearch: true,
                    // Curated facts were already loaded above; avoid a second retrieval pass.
                    disableExternalContext: true,
                    signal,
                    requestId,
                    // Disable side effects so conversation responses don't
                    // pollute the knowledge graph. Memory is managed via memory-push only.
                    disableSideEffects: true,
                }
            );

            void pendingResult.then(result => {
                if (signal.aborted) void result.stream.cancel(signal.reason).catch(() => {});
            }, () => {});
            const result = await withAbort(pendingResult, signal);
            stage = 'stream';
            const boundedStream = abortableStream(result.stream, signal, () => clearTimeout(timer));

            if (wantStream) {
                streaming = true;
                const reader = boundedStream.getReader();
                let cancelled = false;
                // Once headers have gone out, emit a failure marker and close
                // cleanly; error() would turn a handled timeout into Status 0.
                const output = new ReadableStream({
                    async pull(controller) {
                        try {
                            const { done, value } = await reader.read();
                            if (cancelled) return;
                            if (done) { reader.releaseLock(); controller.close(); }
                            else controller.enqueue(value);
                        } catch {
                            if (cancelled) return;
                            console.warn('[JKlaw] Stream ended early', { requestId, elapsedMs: Date.now() - startedAt });
                            controller.enqueue(new TextEncoder().encode(encodeProviderErrorEvent({
                                provider: 'jklaw', model: result.debug?.model ?? 'unknown', reason: 'request_cancelled_or_timed_out',
                            })));
                            controller.close();
                            reader.releaseLock();
                        }
                    },
                    cancel(reason) {
                        cancelled = true;
                        deadline.abort(new DOMException('Response consumer disconnected', 'AbortError'));
                        return reader.cancel(reason).catch(() => {}).finally(() => reader.releaseLock());
                    },
                });
                return new NextResponse(output, {
                    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
                });
            }

            const reader = boundedStream.getReader();
            const decoder = new TextDecoder();
            let text = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                text += decoder.decode(value, { stream: true });
            }

            text += decoder.decode();
            signal.throwIfAborted();
            return NextResponse.json({
                ok: true,
                response: text,
                model: result.debug?.model || 'unknown',
                timestamp: new Date().toISOString(),
            });
        } catch (err: any) {
            const timedOut = deadline.signal.aborted;
            const disconnected = req.signal.aborted;
            console.error('[JKlaw] chat failed', { requestId, stage, elapsedMs: Date.now() - startedAt, timedOut, disconnected });
            return NextResponse.json({
                error: timedOut ? 'JKlaw chat deadline exceeded' : disconnected ? 'Request cancelled' : 'Chat failed',
                requestId,
            }, { status: timedOut ? 504 : disconnected ? 499 : 500 });
        } finally {
            if (!streaming) clearTimeout(timer);
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

            // Using our new DDIA Event Sourcing logic to assert facts explicitly:
            const { emitWorldModelEvent } = await import('@/lib/memory/graphStore');
            const factEntityId = crypto.randomUUID();
            
            await emitWorldModelEvent(
                factEntityId,
                'ASSERTED',
                {
                    entity_type: 'fact',
                    user_id: JKLAW_USER_ID,
                    content: fact,
                    type: memType,
                    tags: tags
                },
                'jklaw-api',   // source_model
                'AXIOM'        // trust_tier: JKlaw assertions are trusted axioms
            );

            // Backwards compatibility for the node projection
            if (tags.length > 0) {
                for (const tag of tags.slice(0, 3)) {
                    await addNode(JKLAW_USER_ID, tag, 'concept', `JKlaw: ${fact.substring(0, 80)}`, {}, 'jklaw-api', 'AXIOM');
                }
            }

            return NextResponse.json({
                ok: true,
                stored: fact.substring(0, 100),
                entity_id: factEntityId,
                world_model_status: 'ASSERTED',
                trust_tier: 'AXIOM',
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
