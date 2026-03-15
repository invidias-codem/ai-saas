import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { requireAuth, handleAuthError, getClientIP } from '@/lib/security/apiAuth';
import { limitApiEndpoint } from '@/lib/security/rateLimit';
import { uuidSchema } from '@/lib/security/inputValidation';
import { auditMemoryOp } from '@/lib/security/auditLog';

export async function POST(request: Request) {
  try {
    const user = await requireAuth();
    const ip = getClientIP(request);

    const rateLimit = await limitApiEndpoint(user.userId, ip, 'mutation');
    if (!rateLimit.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const { factId } = await request.json();

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

    await factRef.delete();
    auditMemoryOp('memory.delete', user.userId, { memoryId: factId });

    return NextResponse.json({
      success: true,
      message: "Memory deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting fact:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
