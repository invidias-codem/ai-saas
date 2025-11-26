import { auth } from "@clerk/nextjs/server";
import * as admin from "firebase-admin";
import { NextResponse } from "next/server";

// Force dynamic rendering since this route uses Clerk auth (headers)
export const dynamic = 'force-dynamic';

// Initialize Firebase Admin app and Firestore
const firebaseApp = !admin.apps.length ? admin.initializeApp() : admin.app();
const db = admin.firestore();

export async function GET() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const factsRef = db.collection("users").doc(userId).collection("facts");
    const snapshot = await factsRef.get();

    if (snapshot.empty) {
      return NextResponse.json({
        totalFacts: 0,
        factsByType: {
          decision: 0,
          action_item: 0,
          blocker: 0,
          project: 0,
          verification: 0,
        },
        factsByScope: {
          conversation: 0,
          user: 0,
        },
        averageConfidence: 0,
        oldestFactDate: null,
        newestFactDate: null,
        expiringFactsCount: 0,
        facts: [],
      });
    }

    const factsByType: any = {
      decision: 0,
      action_item: 0,
      blocker: 0,
      project: 0,
      verification: 0,
    };

    const factsByScope: any = {
      conversation: 0,
      user: 0,
    };

    let confidenceSum = 0;
    let oldestDate: number | null = null;
    let newestDate: number | null = null;
    let expiringFactsCount = 0;
    const now = Date.now();
    const sevenDaysFromNow = now + 7 * 24 * 60 * 60 * 1000;

    const facts: any[] = [];

    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      factsByType[data.type]++;
      factsByScope[data.scope]++;
      confidenceSum += data.confidence || 0;

      const extractedAt = data.extractedAt;
      if (!oldestDate || extractedAt < oldestDate) {
        oldestDate = extractedAt;
      }
      if (!newestDate || extractedAt > newestDate) {
        newestDate = extractedAt;
      }

      // Check if fact is expiring within 7 days
      if (data.expiresAt && data.expiresAt <= sevenDaysFromNow && data.expiresAt > now) {
        expiringFactsCount++;
      }

      const daysUntilExpiry = data.expiresAt
        ? Math.ceil((data.expiresAt - now) / (24 * 60 * 60 * 1000))
        : undefined;

      facts.push({
        id: doc.id,
        type: data.type,
        content: data.content,
        confidence: data.confidence,
        scope: data.scope,
        extractedAt: data.extractedAt,
        expiresAt: data.expiresAt,
        daysUntilExpiry,
      });
    });

    const totalFacts = snapshot.size;
    const averageConfidence = totalFacts > 0 ? confidenceSum / totalFacts : 0;

    return NextResponse.json({
      totalFacts,
      factsByType,
      factsByScope,
      averageConfidence: Math.round(averageConfidence * 100) / 100,
      oldestFactDate: oldestDate,
      newestFactDate: newestDate,
      expiringFactsCount,
      facts: facts.sort((a, b) => b.extractedAt - a.extractedAt),
    });
  } catch (error) {
    console.error("Error fetching memory analytics:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
