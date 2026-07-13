import { NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { supabaseTelemetryAdmin } from "@/lib/supabaseClient";
import { signRecord, verifyRecordSignature } from "@/lib/telemetry/sign";
import type { UdifInteractionAudit } from "@/lib/telemetry/udif";

interface FlushBody {
  records: UdifInteractionAudit[];
}

/**
 * Phase 3.3 — Enterprise audit flush endpoint.
 *
 * Authenticated user POSTs locally-buffered UDIF records. Each is signed into
 * a per-user hash chain (continuing from the user's last governance_signature)
 * and inserted into the DEDICATED telemetry Supabase instance, scoped by the
 * Clerk user_id. local_only records must already be stripped client-side; we
 * defensively reject any that slip through.
 */
export async function POST(req: Request) {
  const clerkUser = await currentUser();
  if (!clerkUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = clerkUser.id;

  if (!supabaseTelemetryAdmin) {
    return NextResponse.json(
      { error: "Telemetry instance not configured" },
      { status: 503 }
    );
  }

  let body: FlushBody;
  try {
    body = (await req.json()) as FlushBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const records = Array.isArray(body?.records) ? body.records : [];
  if (records.length === 0) {
    return NextResponse.json({ ok: true, inserted: 0 });
  }

  // Defensive: never accept local_only content off-device (DECIDED Q2).
  const bad = records.find((r) => r.context_baggage?.content_mode === "local_only");
  if (bad) {
    return NextResponse.json(
      { error: "local_only records must not be exported" },
      { status: 422 }
    );
  }

  // Continue the user's hash chain from their most recent signature.
  let prevHash = "root";
  const { data: last } = await supabaseTelemetryAdmin
    .from("ai_interaction_audit")
    .select("governance_signature")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (last?.governance_signature) prevHash = last.governance_signature;

  const rows = [];
  for (const record of records) {
    const chain = await signRecord(record, prevHash);
    // Self-verify the link before persisting (cheap integrity gate).
    const ok = await verifyRecordSignature(record, chain, prevHash);
    if (!ok) {
      return NextResponse.json(
        { error: "Chain verification failed before insert" },
        { status: 500 }
      );
    }
    rows.push({
      user_id: userId,
      conversation_id: record.context_baggage?.macro_workflow_id ?? null,
      workspace_id: record.ai_ledger.governance?.context_role?.startsWith("workspace:")
        ? record.ai_ledger.governance.context_role.slice("workspace:".length)
        : null,
      record,
      prev_record_hash: chain.prev_record_hash,
      governance_signature: chain.governance_signature,
    });
    prevHash = chain.governance_signature;
  }

  const { error } = await supabaseTelemetryAdmin
    .from("ai_interaction_audit")
    .insert(rows);

  if (error) {
    return NextResponse.json(
      { error: "Insert failed", detail: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, inserted: rows.length });
}
