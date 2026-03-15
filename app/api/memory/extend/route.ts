import { auth } from "@clerk/nextjs/server";
import * as admin from "firebase-admin";
import { NextResponse } from "next/server";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

const db = admin.firestore();

export async function POST(request: Request) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { factId, extendDays = 90 } = await request.json();

    if (!factId) {
      return NextResponse.json(
        { error: "Fact ID is required" },
        { status: 400 }
      );
    }

    const factRef = db.collection("users").doc(userId).collection("facts").doc(factId);
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
