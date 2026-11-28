import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: "Supabase admin client not initialized" }, { status: 500 });
    }

    const repo = req.nextUrl.searchParams.get("repo");
    if (!repo) {
      return NextResponse.json({ error: "Missing repo" }, { status: 400 });
    }

    const { count, error } = await supabaseAdmin
      .from("memory_bank")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("metadata->>featureType", "github")
      .eq("metadata->>repo", repo);

    if (error) {
      console.error("[GitHub Index Status] Supabase count error:", error);
      return NextResponse.json({ error: "Failed to read index status" }, { status: 500 });
    }

    return NextResponse.json({
      repo,
      chunkCount: count ?? 0,
      indexed: typeof count === "number" && count > 0,
    });
  } catch (error: any) {
    console.error("[GitHub Index Status] Error:", error);
    return NextResponse.json({ error: error?.message || "Unknown error" }, { status: 500 });
  }
}
