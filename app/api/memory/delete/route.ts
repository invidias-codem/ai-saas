import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

export async function POST(request: Request) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { factId } = await request.json();

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

    await factRef.delete();

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
