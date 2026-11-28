import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { limitApiEndpoint } from "@/lib/security/rateLimit";
import { getClientIP } from "@/lib/security/apiAuth";
import { z } from "zod";

type RouteParams = { params: Promise<{ workspaceId: string }> };
const grantSchema = z.object({
  path: z.string().min(1).max(4096).refine(value => value.trim().length > 0 && !value.includes("\u0000")),
  label: z.string().trim().min(1).max(256),
  read_only: z.boolean().default(true),
  allow_destructive: z.boolean().default(false),
}).refine(value => !value.read_only || !value.allow_destructive);

// Local grants remain owner-only until the native permission ADR defines
// a separate delegation policy. Cloud rows are not proof of OS consent.
async function ownsWorkspace(userId: string, workspaceId: string): Promise<boolean> {
  if (!supabaseAdmin) throw new Error("Database configuration missing");
  const { data, error } = await supabaseAdmin
    .from("workspaces").select("id").eq("id", workspaceId).eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth();
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });
    const rate = await limitApiEndpoint(userId, getClientIP(req), "mutation");
    if (!rate.success) return new NextResponse("Too many requests", { status: 429 });
    if (!supabaseAdmin) return new NextResponse("Backend not configured", { status: 503 });
    const { workspaceId } = await params;
    if (!await ownsWorkspace(userId, workspaceId)) {
      return new NextResponse("Workspace not found or not accessible", { status: 404 });
    }
    const parsed = grantSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return new NextResponse("Invalid grant", { status: 400 });
    const { data, error } = await supabaseAdmin
      .from("harness_root_grants")
      .insert({ workspace_id: workspaceId, user_id: userId, ...parsed.data })
      .select().single();
    if (error) throw error;
    return NextResponse.json(data);
  } catch {
    return new NextResponse("Grant service unavailable", { status: 503 });
  }
}

export async function GET(req: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth();
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });
    const rate = await limitApiEndpoint(userId, getClientIP(req), "query");
    if (!rate.success) return new NextResponse("Too many requests", { status: 429 });
    if (!supabaseAdmin) return new NextResponse("Backend not configured", { status: 503 });
    const { workspaceId } = await params;
    if (!await ownsWorkspace(userId, workspaceId)) {
      return new NextResponse("Workspace not found or not accessible", { status: 404 });
    }
    const { data, error } = await supabaseAdmin.from("harness_root_grants")
      .select("*").eq("workspace_id", workspaceId).eq("user_id", userId);
    if (error) throw error;
    return NextResponse.json(data);
  } catch {
    return new NextResponse("Grant service unavailable", { status: 503 });
  }
}
