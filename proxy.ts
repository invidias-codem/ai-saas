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

export default clerkMiddleware(async (auth, req) => {
  // Allow public routes without auth check
  if (isPublicRoute(req)) {
    return;  // Continue without auth
  }

  // For API routes, protect and return 401 if not authenticated
  // For page routes, protect redirects to sign-in automatically
  try {
    auth().protect();
  } catch (err) {
    // For API routes that aren't public, return 401
    if (req.nextUrl.pathname.startsWith('/api')) {
      return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    // For page routes, the error will trigger redirect to sign-in
    throw err;
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
