// app/api/code-builder/stream/route.ts
// SSE streaming endpoint for UCOL Code Builder.
// Clerk auth + rate limiting + per-request ContextRouter + error events.

import { requireAuth, handleAuthError, getClientIP } from '@/lib/security/apiAuth';
import { limitApiEndpoint } from '@/lib/security/rateLimit';
import { ContextRouter } from '@/lib/ucol/contextRouter';
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

export const runtime = 'nodejs';
export const maxDuration = 120; // Long-running SSE — 2 min ceiling

export async function GET(req: Request) {
    try {
        // 1. Auth
        const user = await requireAuth();
        const ip = getClientIP(req);

        // 2. Rate Limiting (AI endpoint)
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

        // 3. Parse params
        const { searchParams } = new URL(req.url);
        const prompt = searchParams.get('prompt');

        if (!prompt || !prompt.trim()) {
            return new Response(JSON.stringify({ error: 'Missing prompt parameter' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }

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
                };

                // Per-request router (no singleton — prevents cross-contamination)
                const router = new ContextRouter({
                    onContextFlow: (entry: ContextFlowEntry) => {
                        session.contextFlow.push(entry);
                        send('context-flow', entry);
                    },
                });

                try {
                    // ── Phase 1: Gemini plans ──
                    const plan = await router.planProject(prompt, session);
                    session.plan = plan;
                    send('plan-ready', plan);

                    // ── Phase 2: Claude codes each component ──
                    const files = await router.generateCode(plan, session);

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
