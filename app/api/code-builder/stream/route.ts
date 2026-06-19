// app/api/code-builder/stream/route.ts
// SSE streaming endpoint for UCOL Code Builder.
// Clerk auth + rate limiting + per-request ContextRouter + error events.
//
// DEV BYPASS: Set DEV_BYPASS_TOKEN in .env.local and pass ?dev_token=<value>
// to skip Clerk auth for local testing. Never set this in production.

import { requireAuth, handleAuthError, getClientIP } from '@/lib/security/apiAuth';
import { limitApiEndpoint } from '@/lib/security/rateLimit';
import { ContextRouter } from '@/lib/ucol/contextRouter';
import { z } from 'zod';
import {
    generatePackageJson,
    generateTsConfig,
    generateTailwindConfig,
    generatePostcssConfig,
    generateNextConfig,
    generateGlobalCss,
    generateRootLayout,
} from '@/lib/ucol/projectTemplates';
import type { BuildSession, ContextFlowEntry, GeneratedFile } from '@/lib/ucol/types';
import { getUserProviderApiKeys } from '@/lib/userProviderKeys';

export const runtime = 'nodejs';
export const maxDuration = 300; // Vercel Pro: 5 min ceiling for streaming SSE

const CodeBuilderQuerySchema = z.object({
    prompt: z.string().min(1, "Prompt is required").max(5000, "Prompt too long"),
    mode: z.enum(['fast', 'full']).optional(),
    dev_token: z.string().optional()
});

// Max components before we warn and trim (prevents guaranteed timeout)
const MAX_COMPONENTS = 12;

// ─── Dev bypass helper ────────────────────────────────────────────────────────
// Returns a synthetic user object if DEV_BYPASS_TOKEN is configured and the
// request includes a matching ?dev_token= param. Returns null otherwise.
function checkDevBypass(req: Request): { userId: string } | null {
    const bypassToken = process.env.DEV_BYPASS_TOKEN;
    if (!bypassToken || process.env.NODE_ENV === 'production') return null;

    const { searchParams } = new URL(req.url);
    const provided = searchParams.get('dev_token');
    if (provided && provided === bypassToken) {
        return { userId: 'dev-bypass-user' };
    }
    return null;
}
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
    try {
        // 1. Auth (with dev bypass for local testing)
        const devUser = checkDevBypass(req);
        const user = devUser ?? await requireAuth();
        const ip = getClientIP(req);

        // 2. Rate Limiting — skip for dev bypass
        if (!devUser) {
            const rateLimit = await limitApiEndpoint(user.userId, ip, 'ai');
            if (!rateLimit.success) {
                return new Response(
                    JSON.stringify({ error: 'Too many requests', message: 'Code builder rate limit exceeded' }),
                    {
                        status: 429,
                        headers: {
                            'Content-Type': 'application/json',
                            'Retry-After': String(Math.ceil((rateLimit.reset - Date.now()) / 1000)),
                        },
                    }
                );
            }
        }

        // 3. Parse params
        const url = new URL(req.url);
        const params = Object.fromEntries(url.searchParams.entries());

        const validation = CodeBuilderQuerySchema.safeParse(params);
        if (!validation.success) {
            return new Response(JSON.stringify({ error: 'Validation Error', details: validation.error.flatten() }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const { prompt, mode } = validation.data;
        // ?mode=fast  → single-pass (no Gemini review loop) — faster, good for iteration
        // ?mode=full  → full debate loop (default) — higher quality
        const fast = mode === 'fast';

        // 4. Build SSE stream
        const encoder = new TextEncoder();

        const stream = new ReadableStream({
            async start(controller) {
                const send = (event: string, data: any) => {
                    try {
                        controller.enqueue(
                            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
                        );
                    } catch {
                        // Controller may be closed if client disconnected
                    }
                };

                const sendError = (message: string, phase: string) => {
                    send('error', { message, phase, timestamp: Date.now() });
                    try { controller.close(); } catch { }
                };

                // Per-request session
                const session: BuildSession = {
                    id: crypto.randomUUID(),
                    userId: user.userId,
                    files: [],
                    contextFlow: [],
                    reviewRounds: 0,
                    constraintRounds: 0,
                    discoveredPatterns: [],
                };

                const providerKeys = await getUserProviderApiKeys(user.userId);

                // Per-request router (no singleton — prevents cross-contamination)
                const router = new ContextRouter({
                    providerKeys,
                    onContextFlow: (entry: ContextFlowEntry) => {
                        session.contextFlow.push(entry);
                        send('context-flow', entry);
                    },
                });

                try {
                    // ── Phase 1: Gemini plans ──
                    const plan = await router.planProject(prompt, session);
                    session.plan = plan;

                    // ── Component cap: warn + trim if Gemini over-plans ──
                    if (plan.components.length > MAX_COMPONENTS) {
                        const trimmed = plan.components.length - MAX_COMPONENTS;
                        plan.components = plan.components.slice(0, MAX_COMPONENTS);
                        send('warning', {
                            message: `Plan trimmed: ${trimmed} lower-priority component(s) deferred to keep build under time limit. Use ?mode=fast for large projects.`,
                            componentCount: plan.components.length,
                        });
                    }

                    send('plan-ready', plan);

                    // ── Phase 2: Claude codes each component (parallel by dependency tier) ──
                    const files = await router.generateCode(plan, session, fast);

                    // Emit individual file events
                    for (const file of files) {
                        session.files.push(file);
                        send('file-generated', file);
                    }

                    // ── Phase 3: Append project scaffolding ──
                    const hasTailwind = plan.techStack.some(t => /tailwind/i.test(t));
                    const scaffoldFiles: GeneratedFile[] = [
                        {
                            path: 'package.json',
                            content: generatePackageJson(plan.appName, plan.techStack),
                            language: 'json',
                            component: '_scaffold',
                            model: 'system',
                        },
                        {
                            path: 'tsconfig.json',
                            content: generateTsConfig(),
                            language: 'json',
                            component: '_scaffold',
                            model: 'system',
                        },
                        {
                            path: 'next.config.js',
                            content: generateNextConfig(),
                            language: 'javascript',
                            component: '_scaffold',
                            model: 'system',
                        },
                        {
                            path: 'app/layout.tsx',
                            content: generateRootLayout(plan.appName),
                            language: 'tsx',
                            component: '_scaffold',
                            model: 'system',
                        },
                        {
                            path: 'app/globals.css',
                            content: generateGlobalCss(),
                            language: 'css',
                            component: '_scaffold',
                            model: 'system',
                        },
                    ];

                    if (hasTailwind) {
                        scaffoldFiles.push(
                            {
                                path: 'tailwind.config.js',
                                content: generateTailwindConfig(),
                                language: 'javascript',
                                component: '_scaffold',
                                model: 'system',
                            },
                            {
                                path: 'postcss.config.js',
                                content: generatePostcssConfig(),
                                language: 'javascript',
                                component: '_scaffold',
                                model: 'system',
                            }
                        );
                    }

                    for (const sf of scaffoldFiles) {
                        send('file-generated', sf);
                    }

                    // ── Done ──
                    send('done', {
                        fileCount: files.length + scaffoldFiles.length,
                        componentCount: plan.components.length,
                        appName: plan.appName,
                        reviewRounds: session.reviewRounds,
                        constraintRounds: session.constraintRounds,
                        discoveredPatterns: session.discoveredPatterns,
                        mode: fast ? 'fast' : 'full',
                    });
                } catch (err: any) {
                    console.error('[UCOL:Stream] Build error:', err);
                    const phase = session.plan ? 'coding' : 'planning';
                    sendError(
                        err.message || 'An unexpected error occurred during build',
                        phase
                    );
                    return; // stream already closed by sendError
                }

                try { controller.close(); } catch { }
            },
        });

        return new Response(stream, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache, no-transform',
                'Connection': 'keep-alive',
                'X-Accel-Buffering': 'no', // Disable nginx buffering
            },
        });
    } catch (error: any) {
        const authResponse = handleAuthError(error);
        if (authResponse) return authResponse;

        console.error('[UCOL:Stream] Unhandled error:', error);
        return new Response(
            JSON.stringify({ error: 'Internal Server Error', details: error.message }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
}
