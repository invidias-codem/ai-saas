import { supabase } from "@/lib/supabaseClient";

export interface BlueskyPacketConfusionSummary {
  packetId: string;
  packetTitle: string | null;
  total: number;
  skepticismCount: number;
  clarificationCount: number;
  curiosityCount: number;
}

export class BlueskyEngagementInsights {
  async getTopRecurringQuestions(limit = 10): Promise<Array<{ question: string; count: number }>> {
    const { data, error } = await supabase
      .from("bluesky_engagement_learning")
      .select("normalized_comment_text")
      .eq("is_recurring_question_candidate", true)
      .limit(1000);

    if (error || !data) {
      if (error) {
        console.error("[Bluesky] Failed to load recurring questions", error);
      }
      return [];
    }

    const counts = new Map<string, number>();
    for (const row of data) {
      const key = String(row.normalized_comment_text || "").trim();
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    return [...counts.entries()]
      .map(([question, count]) => ({ question, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  async getTopPacketConfusion(limit = 10): Promise<BlueskyPacketConfusionSummary[]> {
    const { data, error } = await supabase
      .from("bluesky_engagement_learning")
      .select("packet_id, packet_title, comment_class")
      .not("packet_id", "is", null)
      .limit(1000);

    if (error || !data) {
      if (error) {
        console.error("[Bluesky] Failed to load packet confusion summary", error);
      }
      return [];
    }

    const grouped = new Map<string, BlueskyPacketConfusionSummary>();

    for (const row of data) {
      const packetId = String(row.packet_id || "").trim();
      if (!packetId) continue;

      if (!grouped.has(packetId)) {
        grouped.set(packetId, {
          packetId,
          packetTitle: row.packet_title ?? null,
          total: 0,
          skepticismCount: 0,
          clarificationCount: 0,
          curiosityCount: 0,
        });
      }

      const summary = grouped.get(packetId)!;
      summary.total += 1;

      const commentClass = String(row.comment_class || "");
      if (commentClass === "skepticism") summary.skepticismCount += 1;
      if (commentClass === "clarification_request") summary.clarificationCount += 1;
      if (commentClass === "product_curiosity") summary.curiosityCount += 1;
    }

    return [...grouped.values()]
      .sort((a, b) => b.total - a.total)
      .slice(0, limit);
  }
}
