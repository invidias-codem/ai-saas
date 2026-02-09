import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import createMiddleware from 'next-intl/middleware';
import { NextResponse } from 'next/server';

const intlMiddleware = createMiddleware({
    locales: ['en', 'th', 'vi'],
    defaultLocale: 'en',
    localePrefix: 'always'
});

// Define public routes that don't require authentication
const isPublicRoute = createRouteMatcher([
    '/',                                        // Landing page
    '/:locale',                                 // Localized landing page
    '/:locale/sign-in(.*)',
    '/:locale/sign-up(.*)',
    '/sign-in(.*)',
    '/sign-up(.*)',
    '/privacy',                                 // Privacy policy page
    '/:locale/privacy',
    '/support',                                 // Support page
    '/:locale/support',
    '/slack',                                   // Slack integration
    '/:locale/slack',
    '/blog(.*)',                                // Blog pages
    '/:locale/blog(.*)',
    '/api/guest-chat',                          // Guest chat API
    '/api/feedback',                            // Feedback ingestion
    '/api/integrations/slack/callback',         // Slack OAuth callback
    '/api/integrations/slack/events',           // Slack Events API
    '/api/integrations/slack/command',          // Slack slash commands
    '/api/integrations/slack/interactivity',    // Slack interactivity
    '/api/integrations/slack/auth',             // OAuth Init
    '/api/webhooks/kofi',                       // Ko-fi Webhook
    '/api/support/verify-donation',             // (Legacy/Optional)
    '/api/integrations/telegram/webhook',       // Telegram Webhook
]);

export default clerkMiddleware(async (auth, req) => {
    const isApi = req.nextUrl.pathname.startsWith('/api') || req.nextUrl.pathname.startsWith('/trpc');

    // Handle API routes (skip intl)
    if (isApi) {
        if (isPublicRoute(req)) {
            return;
        }
        const { userId } = await auth();
        if (!userId) {
            return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        return;
    }

    // Handle Page routes (use intl)
    if (isPublicRoute(req)) {
        return intlMiddleware(req);
    }

    const { userId, redirectToSignIn } = await auth();

    if (!userId) {
        return redirectToSignIn();
    }

    return intlMiddleware(req);
});

export const config = {
    matcher: [
        // Skip Next.js internals and all static files
        '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
        // Always run for API routes
        '/(api|trpc)(.*)',
    ],
};
