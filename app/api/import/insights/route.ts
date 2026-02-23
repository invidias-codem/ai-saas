
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { generateImportInsights } from '@/lib/import/insightsGenerator';

export async function POST(req: Request) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        const report = await generateImportInsights(userId);

        return NextResponse.json({ success: true, report });

    } catch (error: any) {
        console.error("[INSIGHTS_API]", error);
        return new NextResponse(JSON.stringify({ error: error.message }), { status: 500 });
    }
}
