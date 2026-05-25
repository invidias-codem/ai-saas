import { NextResponse } from "next/server";
import { requireAuth } from '@/lib/security/apiAuth';
import { getUserCredits } from '@/lib/subscription/credits';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const user = await requireAuth();
        const credits = await getUserCredits(user.userId);
        return NextResponse.json({ computeCredits: credits });
    } catch (error) {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
