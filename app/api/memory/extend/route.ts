import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { requireAuth, handleAuthError, getClientIP } from '@/lib/security/apiAuth';
import { limitApiEndpoint } from '@/lib/security/rateLimit';
import { uuidSchema } from '@/lib/security/inputValidation';

export async function POST(request: Request) {
  try {
    const user = await requireAuth();
    const ip = getClientIP(request);

    const rateLimit = await limitApiEndpoint(user.userId, ip, 'mutation');
    if (!rateLimit.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const { factId, extendDays = 90 } = await request.json();

    const factIdValidation = uuidSchema.safeParse(factId);
    if (!factIdValidation.success) {
      return NextResponse.json(
        { error: "Invalid fact ID format" },
        { status: 400 }
      );
    }

    const factRef = db.collection("users").doc(user.userId).collection("facts").doc(factId);
    const factDoc = await factRef.get();

    if (!factDoc.exists) {
      return NextResponse.json({ error: "Fact not found" }, { status: 404 });
    }

    const factData = factDoc.data();

    // Only conversation-level facts can expire; user-level facts persist indefinitely
    if (factData?.scope !== "conversation") {
      return NextResponse.json(
        { error: "User-level facts do not expire" },
        { status: 400 }
      );
    }

    const extendMs = extendDays * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const newExpiresAt = now + extendMs;

    await factRef.update({
      expiresAt: newExpiresAt,
      lastExtendedAt: now,
    });

    return NextResponse.json({
      success: true,
      newExpiresAt,
      message: `Memory extended by ${extendDays} days`,
    });
  } catch (error) {
    console.error("Error extending fact TTL:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
