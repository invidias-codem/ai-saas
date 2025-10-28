// proxy.ts
import { authMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server"; // Import NextResponse

export default authMiddleware({
  publicRoutes: [
    "/", // Landing page
    "/sign-in",
    "/sign-up",
  ],
  
  ignoredRoutes: ["/ws"],

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

    // ✅ **This is the fix:**
    // We check if the pathname starts with /api
    const isApiRoute = req.nextUrl.pathname.startsWith("/api");

    if (isApiRoute) {
      // For API routes, return a 401 Unauthorized JSON response.
      return new NextResponse(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    
    // For all other protected pages, redirect to sign-in.
    const signInUrl = new URL("/sign-in", req.url);
    signInUrl.searchParams.set("redirect_url", req.url);
    return NextResponse.redirect(signInUrl);
  },
});

export const config = {
  matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/", "/(api|trpc)(.*)"],
};

