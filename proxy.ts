// proxy.ts - Next.js 16+ compatible Clerk middleware
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

// Define public routes that don't require authentication
const isPublicRoute = createRouteMatcher([
  '/',                                        // Landing page
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/privacy',                                 // Privacy policy page - public
  '/support',                                 // Support page - public
  '/slack',                                   // Slack integration landing page - public
  '/blog(.*)',                                // Blog pages
  '/api/guest-chat',                          // Guest chat API - public for landing page
  '/api/feedback',                            // Feedback ingestion (anonymous allowed)
  '/api/integrations/slack/callback',         // Slack OAuth callback
  '/api/integrations/slack/events',           // Slack Events API
  '/api/integrations/slack/command',          // Slack slash commands
  '/api/integrations/slack/interactivity',    // Slack interactivity (buttons, modals)
  '/api/integrations/slack/auth',             // OAuth Init (handled manually for redirects)
  '/api/webhooks/kofi',                       // Ko-fi Webhook
  '/api/support/verify-donation',             // (Legacy/Optional)
  '/api/integrations/telegram/webhook',       // Telegram Webhook
]);

// Define ignored routes (skip auth processing entirely)
const isIgnoredRoute = createRouteMatcher([
  '/ws',
  '/api/guest-chat',
  '/api/feedback',
  '/api/integrations/slack/callback',
  '/api/integrations/slack/events',
  '/api/integrations/slack/command',
  '/api/integrations/slack/interactivity',
  '/api/webhooks/kofi',
  '/api/integrations/telegram/webhook',
]);

export default clerkMiddleware(async (auth, req) => {
  // Skip ignored routes entirely
  if (isIgnoredRoute(req)) {
    return NextResponse.next();
  }

  // Allow public routes without auth check
  if (isPublicRoute(req)) {
    return NextResponse.next();
  }

  // For protected routes, check authentication
  const { userId } = await auth();

  if (userId) {
    return NextResponse.next();
  }

  // User is NOT authenticated and is on a PROTECTED route
  const isApiRoute = req.nextUrl.pathname.startsWith('/api');

  if (isApiRoute) {
    return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // For all other protected pages, redirect to sign-in
  const signInUrl = new URL('/sign-in', req.url);
  signInUrl.searchParams.set('redirect_url', req.url);

  // Add a friendly indicator for blog pages
  if (req.nextUrl.pathname.startsWith('/blog')) {
    signInUrl.searchParams.set('from', 'blog');
  }

  return NextResponse.redirect(signInUrl);
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
