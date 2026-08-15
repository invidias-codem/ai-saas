// middleware.ts — UPDATED: fix Clerk auth() context propagation for API routes
// Changes from previous: return NextResponse.next() instead of bare return; for API routes
// so Clerk can inject auth headers into downstream route handlers (fixes 500s on all API routes).

import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import createMiddleware from 'next-intl/middleware';
import { NextResponse } from 'next/server';
import { parseReferralParams, REFERRAL_COOKIE, PLATFORM_COOKIE, COOKIE_MAX_AGE } from '@/lib/referral';

const intlMiddleware = createMiddleware({
    locales: ['en', 'th', 'vi', 'es', 'fr', 'de'],
    defaultLocale: 'en',
    localePrefix: 'always'
});

const isPublicRoute = createRouteMatcher([
    '/',
    '/:locale',
    '/:locale/sign-in(.*)',
    '/:locale/sign-up(.*)',
    '/sign-in(.*)',
    '/sign-up(.*)',
    '/privacy',
    '/:locale/privacy',
    '/support',
    '/:locale/support',
    '/docs',
    '/:locale/docs',
    '/docs/(.*)',
    '/:locale/docs/(.*)',
    '/slack',
    '/:locale/slack',
    '/blog(.*)',
    '/:locale/blog(.*)',
    '/videos(.*)',
    '/api/guest-chat',
    '/api/feedback',
    '/api/integrations/slack/callback',
    '/api/integrations/slack/events',
    '/api/integrations/slack/command',
    '/api/integrations/slack/interactivity',
    '/api/integrations/slack/auth',
    '/api/webhooks/kofi',
    '/api/webhooks/stripe',
    '/api/support/verify-donation',
    '/api/integrations/telegram/webhook',
    '/api/internal/jklaw',
    '/api/internal/route-to-jklaw',
    '/api/referral/capture',
    '/api/cron(.*)',  // ← public so it works right after signup
    '/api/test-mcts',
    '/api/webhooks/vercel-logs',
    '/api/cli/stream',
    '/api/memory/cli',
    '/api/code',
    '/api/v1/(.*)',  // partner gateway — uses its own bearer auth, not Clerk
]);

export default clerkMiddleware(async (auth, req) => {
    // ─── DESKTOP STATIC EXPORT BYPASS ──────────
    if (process.env.NEXT_PUBLIC_IS_DESKTOP === 'true') {
        return NextResponse.next();
    }
    // ───────────────────────────────────────────

    const isApi = req.nextUrl.pathname.startsWith('/api') || req.nextUrl.pathname.startsWith('/trpc');

    // ─── REFERRAL TRACKING (runs on ALL page requests, no auth needed) ──────────
    // Only capture on page routes (not API), and only if ?ref= is present
    const { ref, platform, campaign } = parseReferralParams(req.nextUrl.searchParams);

    if (ref && !isApi) {
        // First-touch only: don't overwrite an existing cookie
        const existingRef = req.cookies.get(REFERRAL_COOKIE)?.value;

        if (!existingRef) {
            // We'll set the cookie on the response after routing resolves
            // Using a flag to apply after intlMiddleware or auth redirect
            req.headers.set('x-capture-ref', ref);
            req.headers.set('x-capture-platform', platform || 'direct');
            if (campaign) req.headers.set('x-capture-campaign', campaign);
        }
    }
    // ────────────────────────────────────────────────────────────────────────────

    if (isApi) {
        // IMPORTANT: Must return NextResponse.next() (not bare `return`) so Clerk
        // injects its internal auth headers. Without this, auth() calls inside
        // route handlers throw "Clerk can't detect usage of clerkMiddleware()".
        if (isPublicRoute(req)) return NextResponse.next();

        // DEV BYPASS (never in production): route handlers implement their own
        // ?dev_token= check, but Clerk middleware ran first and 401'd the request
        // before the handler could. Honor the same token here.
        if (process.env.NODE_ENV !== 'production' && process.env.DEV_BYPASS_TOKEN) {
            const devToken = req.nextUrl.searchParams.get('dev_token');
            if (devToken && devToken === process.env.DEV_BYPASS_TOKEN) {
                return NextResponse.next();
            }
        }

        const { userId } = await auth();
        if (!userId) {
            return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        return NextResponse.next();
    }

    let res: NextResponse;

    if (isPublicRoute(req)) {
        res = intlMiddleware(req) as NextResponse;
    } else {
        const { userId, redirectToSignIn } = await auth();
        if (!userId) return redirectToSignIn();
        res = intlMiddleware(req) as NextResponse;
    }

    // Apply referral cookies to the response if we captured a ref above
    const capturedRef = req.headers.get('x-capture-ref');
    if (capturedRef) {
        res.cookies.set(REFERRAL_COOKIE, capturedRef, {
            maxAge:   COOKIE_MAX_AGE,
            path:     '/',
            sameSite: 'lax',
            secure:   process.env.NODE_ENV === 'production',
            httpOnly: false, // Must be readable by client-side JS for capture API call
        });
        const capturedPlatform = req.headers.get('x-capture-platform');
        if (capturedPlatform) {
            res.cookies.set(PLATFORM_COOKIE, capturedPlatform, {
                maxAge:   COOKIE_MAX_AGE,
                path:     '/',
                sameSite: 'lax',
                secure:   process.env.NODE_ENV === 'production',
            });
        }
    }

    return res;
});

export const config = {
    matcher: [
        '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|mp4)).*)',
        '/(api|trpc)(.*)',
    ],
};
