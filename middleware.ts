// Fail-closed middleware: all routes require auth by default.
// Public routes are explicitly whitelisted below. Every route not listed
// is redirected to Clerk sign-in, preserving the intended destination.
// proxy.ts is intentionally untouched and remains as-is.

import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
    // Core app shell / landing
    "/",
    "/:locale",

    // Auth surfaces
    "/sign-in(.*)",
    "/:locale/sign-in(.*)",
    "/sign-up(.*)",
    "/:locale/sign-up(.*)",

    // Explore tour (the new public surface)
    "/explore(.*)",
    "/:locale/explore(.*)",

    // Docs
    "/docs",
    "/:locale/docs",
    "/docs/(.*)",
    "/:locale/docs/(.*)",

    // Public marketing / product pages (mirrored from proxy.ts public list)
    "/expert(.*)",
    "/:locale/expert(.*)",
    "/expert/v(.*)",
    "/:locale/expert/v(.*)",
    "/sovereign(.*)",
    "/:locale/sovereign(.*)",
    "/slack",
    "/:locale/slack",
    "/blog(.*)",
    "/:locale/blog(.*)",
    "/videos(.*)",

    // Public pages
    "/privacy",
    "/:locale/privacy",
    "/support",
    "/:locale/support",

    // Public API surfaces (preserved from existing public routes in proxy.ts)
    "/api/guest-chat",
    "/api/feedback",
    "/api/integrations/slack/callback",
    "/api/integrations/slack/events",
    "/api/integrations/slack/command",
    "/api/integrations/slack/interactivity",
    "/api/integrations/slack/auth",
    "/api/webhooks/kofi",
    "/api/webhooks/stripe",
    "/api/support/verify-donation",
    "/api/integrations/telegram/webhook",
    "/api/internal/jklaw",
    "/api/internal/route-to-jklaw",
    "/api/referral/capture",
    "/api/cron(.*)",
    "/api/test-mcts",
    "/api/webhooks/vercel-logs",
    "/api/cli/stream",
    "/api/memory/cli",
    "/api/code",
    "/api/v1/(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
    // Desktop static export bypass (matches proxy.ts behavior)
    if (process.env.NEXT_PUBLIC_IS_DESKTOP === "true") {
        return NextResponse.next();
    }

    const isApi = req.nextUrl.pathname.startsWith("/api");

    if (isPublicRoute(req)) {
        return NextResponse.next();
    }

    if (isApi) {
        // For non-public API routes: require auth server-side.
        // Existing per-route requireAuth() stays as defense-in-depth.
        const { userId } = await auth();
        if (!userId) {
            return new NextResponse(JSON.stringify({ error: "Unauthorized" }), {
                status: 401,
                headers: { "Content-Type": "application/json" },
            });
        }
        return NextResponse.next();
    }

    // Protected page route: redirect to sign-in, preserving destination
    const { userId, redirectToSignIn } = await auth();
    if (!userId) {
        return redirectToSignIn({ redirectUrl: req.url });
    }

    return NextResponse.next();
});

export const config = {
    matcher: [
        // Skip static files, _next, and obvious non-route assets
        "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|mp4)).*)",
        "/(api|trpc)(.*)",
    ],
};
