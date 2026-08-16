// app/api/admin/metrics/route.ts
// Aggregated telemetry metrics for the Lattice OS funnel.
// Protected by admin Clerk ID check.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Admin check
  if (userId !== process.env.ADMIN_CLERK_ID) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Supabase not initialized" }, { status: 500 });
  }

  try {
    // Use the aggregation RPC
    const { data, error } = await supabaseAdmin.rpc("get_telemetry_metrics", {
      lookback_days: 7,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
