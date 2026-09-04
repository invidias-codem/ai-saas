import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { SignJWT } from "jose";

export const dynamic = "force-dynamic";

const TOKEN_TTL_SECONDS = 15 * 60; // 15 min — long enough to complete Ko-fi checkout
const KOFI_BASE = "https://ko-fi.com";

function getJwtSecret(): Uint8Array {
  const secret = process.env.KOFI_JWT_SECRET;
  if (!secret) {
    throw new Error("KOFI_JWT_SECRET is not configured");
  }
  return new TextEncoder().encode(secret);
}

/**
 * GET /api/checkout/kofi
 *
 * Generates a one-time JWT carrying { userId, email, plan } and 302-redirects
 * the authenticated user to the Ko-fi tier page with the JWT embedded as a
 * query param hint. The buyer pastes the JWT into the Ko-fi "Message" field
 * (or we auto-fill via URL fragment; Ko-fi doesn't support direct prefill).
 *
 * The webhook handler at /api/webhooks/kofi/route.ts decodes payload.message
 * and verifies the JWT — if valid, the clerk_user_id is used directly,
 * bypassing email matching.
 */
export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.redirect(new URL("/sign-in", req.url));
    }

    const user = await currentUser();
    const email = user?.emailAddresses?.[0]?.emailAddress;
    if (!email) {
      return NextResponse.json(
        { error: "User has no email address on file" },
        { status: 400 }
      );
    }

    const page = process.env.NEXT_PUBLIC_KOFI_PAGE;
    if (!page) {
      return NextResponse.json(
        { error: "NEXT_PUBLIC_KOFI_PAGE is not configured" },
        { status: 500 }
      );
    }

    // Plan is fixed server-side — never trust client-supplied params for tier
    const plan = "expert";

    const token = await new SignJWT({ userId, email, plan })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(`${TOKEN_TTL_SECONDS}s`)
      .setAudience("kofi-checkout")
      .setSubject(userId)
      .sign(getJwtSecret());

    // Ko-fi does NOT support prefilling the message field via URL.
    // We embed the JWT in a URL fragment (#msg=...) and serve an interstitial
    // that copies it to clipboard. The buyer then pastes it into Ko-fi's
    // message textarea during checkout.
    const interstitial = new URL("/api/checkout/kofi/redirect", req.url);
    interstitial.searchParams.set("token", token);
    interstitial.searchParams.set("page", page);

    return NextResponse.redirect(interstitial);
  } catch (error: any) {
    console.error("[kofi:checkout] Error:", error);
    return NextResponse.json(
      { error: "Failed to start Ko-fi checkout", details: error?.message },
      { status: 500 }
    );
  }
}
