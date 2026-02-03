// proxy.ts
import { authMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export const proxy = authMiddleware({
  // ✅ 1. Manually pass all environment variables
  // (Removed manual keys to rely on auto-detection and fix DEPRECATION/Encryption Key warnings)


  publicRoutes: [
    "/", // Landing page
    "/sign-in",
    "/sign-up",
    "/privacy",  // Privacy policy page - public
    "/support",  // Support page - public
    "/slack",    // Slack integration landing page - public
    "/api/guest-chat",                        // Guest chat API - public for landing page
    "/api/feedback",                          // Feedback ingestion (anonymous allowed)
    "/api/integrations/slack/callback",      // Slack OAuth callback
    "/api/integrations/slack/events",        // Slack Events API
    "/api/integrations/slack/command",       // Slack slash commands
    "/api/integrations/slack/interactivity", // Slack interactivity (buttons, modals)
    "/api/integrations/slack/auth",          // 0Auth Init (handled manually for redirects)
    "/api/webhooks/kofi",                    // Ko-fi Webhook
    "/api/support/verify-donation",          // (Legacy/Optional)
    "/api/integrations/telegram/webhook",  // Telegram Webhook
  ],

  ignoredRoutes: [
    "/ws",
    "/api/guest-chat",                        // Guest chat - no auth needed
    "/api/feedback",                          // Feedback ingestion (anonymous allowed)
    "/api/integrations/slack/callback",      // Also ignore for Slack redirects
    "/api/integrations/slack/events",        // Slack sends events without auth
    "/api/integrations/slack/command",       // Slack sends commands without auth
    "/api/integrations/slack/interactivity", // Slack sends interactions without auth
    "/api/webhooks/kofi",                    // Ko-fi Webhook
    "/api/integrations/telegram/webhook",  // Telegram sends without auth
  ],

  afterAuth(auth, req) {
    // Handle public routes
    if (auth.isPublicRoute) {
      return NextResponse.next();
    }

    // Handle authenticated users
    if (auth.userId) {
      return NextResponse.next();
    }

    // ---
    // User is NOT authenticated and is on a PROTECTED route.
    // ---
    const isApiRoute = req.nextUrl.pathname.startsWith("/api");

    if (isApiRoute) {
      return new NextResponse(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // For all other protected pages, redirect to sign-in.
    const signInUrl = new URL("/sign-in", req.url);
    signInUrl.searchParams.set("redirect_url", req.url);

    // Add a friendly indicator for blog pages so we can show a custom message
    const isBlogRoute = req.nextUrl.pathname.startsWith("/blog");
    if (isBlogRoute) {
      signInUrl.searchParams.set("from", "blog");
    }

    return NextResponse.redirect(signInUrl);
  },
});

export const config = {
  matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/", "/(api|trpc)(.*)"],
};

export default proxy;

