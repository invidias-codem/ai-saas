import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { requireAuth, getClientIP } from '@/lib/security/apiAuth';
import { limitApiEndpoint } from '@/lib/security/rateLimit';

// Memory type from database
interface Memory {
  id: string;
  user_id: string;
  content: string;
  type: string;
  scope: string;
  confidence: string | number;
  extracted_at: string;
  expires_at: string | null;
  conversation_id?: string;
  created_at?: string;
}

// Force dynamic rendering since this route uses Clerk auth (headers)
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const user = await requireAuth();
    const ip = getClientIP(req);

    const rateLimit = await limitApiEndpoint(user.userId, ip, 'query');
    if (!rateLimit.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const { supabase } = await import("@/lib/supabaseClient");

    if (!supabase) {
      console.error("Supabase client not initialized");
      return NextResponse.json({ error: "Database configuration missing" }, { status: 500 });
    }

    // Get memory count from user_profiles (instant, no counting needed)
    const { data: profileData } = await supabase
      .from('user_profiles')
      .select('memory_count')
      .eq('user_id', user.userId)
      .single();

    const totalFacts = profileData?.memory_count || 0;

    // If no memories, return empty analytics
    if (totalFacts === 0) {
      return NextResponse.json({
        totalFacts: 0,
        factsByType: {
          general: 0,
          preference: 0,
          personal_info: 0,
          question: 0,
          decision: 0,
        },
        factsByScope: {
          session: 0,
          persistent: 0,
        },
        averageConfidence: 0,
        oldestFactDate: null,
        newestFactDate: null,
        expiringFactsCount: 0,
        facts: [],
      });
    }

    // Fetch memories from memory_bank
    const { data: memories, error } = await supabase
      .from('memory_bank')
      .select('*')
      .eq('user_id', user.userId)
      .order('extracted_at', { ascending: false }) as { data: Memory[] | null; error: any };

    if (error) {
      console.error("Error fetching memories:", error);
      return NextResponse.json({ error: "Failed to fetch memories" }, { status: 500 });
    }

    // Calculate analytics
    const factsByType: Record<string, number> = {
      general: 0,
      preference: 0,
      personal_info: 0,
      question: 0,
      decision: 0,
    };

    const factsByScope: Record<string, number> = {
      session: 0,
      persistent: 0,
    };

    let confidenceSum = 0;
    let oldestDate: number | null = null;
    let newestDate: number | null = null;
    let expiringFactsCount = 0;
    const now = Date.now();
    const sevenDaysFromNow = now + 7 * 24 * 60 * 60 * 1000;

    const facts: any[] = [];

    memories?.forEach((memory) => {
      // Count by type
      const type = memory.type || 'general';
      factsByType[type] = (factsByType[type] || 0) + 1;

      // Count by scope
      const scope = memory.scope || 'session';
      factsByScope[scope] = (factsByScope[scope] || 0) + 1;

      // Sum confidence
      confidenceSum += parseFloat(String(memory.confidence)) || 0;

      // Track dates
      const extractedAt = new Date(memory.extracted_at).getTime();
      if (!oldestDate || extractedAt < oldestDate) {
        oldestDate = extractedAt;
      }
      if (!newestDate || extractedAt > newestDate) {
        newestDate = extractedAt;
      }

      // Check if memory is expiring within 7 days
      if (memory.expires_at) {
        const expiresAt = new Date(memory.expires_at).getTime();
        if (expiresAt <= sevenDaysFromNow && expiresAt > now) {
          expiringFactsCount++;
        }
      }

      // Calculate days until expiry
      const daysUntilExpiry = memory.expires_at
        ? Math.ceil((new Date(memory.expires_at).getTime() - now) / (24 * 60 * 60 * 1000))
        : undefined;

      facts.push({
        id: memory.id,
        type: memory.type,
        content: memory.content,
        confidence: parseFloat(String(memory.confidence)),
        scope: memory.scope,
        extractedAt: extractedAt,
        expiresAt: memory.expires_at ? new Date(memory.expires_at).getTime() : undefined,
        daysUntilExpiry,
      });
    });

    const averageConfidence = totalFacts > 0 ? confidenceSum / totalFacts : 0;

    return NextResponse.json({
      totalFacts,
      factsByType,
      factsByScope,
      averageConfidence: Math.round(averageConfidence * 100) / 100,
      oldestFactDate: oldestDate,
      newestFactDate: newestDate,
      expiringFactsCount,
      facts,
    });
  } catch (error) {
    console.error("Error fetching memory analytics:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
