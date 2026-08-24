// app/api/plan/check/route.ts
// Server endpoint: returns the caller's plan state.
// Used by the client-side PaywallGate to decide whether to render premium content.
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/security/apiAuth";
import { hasUnlimitedUsageAccess } from "@/lib/credits";

export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const user = await requireAuth();
        const hasPlan = await hasUnlimitedUsageAccess(user.userId);

        return NextResponse.json({
            hasPlan,
            tier: hasPlan ? "pro" : "free",
        });
    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
