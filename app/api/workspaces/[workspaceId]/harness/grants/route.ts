import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabaseClient";

export async function POST(
  req: Request,
  { params }: { params: { workspaceId: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });
    if (!supabaseAdmin) return new NextResponse("Supabase admin not configured", { status: 500 });

    const body = await req.json();
    const { path, label, read_only, allow_destructive } = body;

    const { data: newGrant, error } = await supabaseAdmin
      .from("harness_root_grants")
      .insert({
        workspace_id: params.workspaceId,
        user_id: userId,
        path,
        label,
        read_only,
        allow_destructive,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(newGrant);
  } catch (error) {
    console.error("[HARNESS_GRANT_POST]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

export async function GET(
  req: Request,
  { params }: { params: { workspaceId: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });
    if (!supabaseAdmin) return new NextResponse("Supabase admin not configured", { status: 500 });

    const { data: grants, error } = await supabaseAdmin
      .from("harness_root_grants")
      .select("*")
      .eq("workspace_id", params.workspaceId)
      .eq("user_id", userId); // ensure user_id isolation if workspace_id isn't enough

    if (error) throw error;

    return NextResponse.json(grants);
  } catch (error) {
    console.error("[HARNESS_GRANT_GET]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
