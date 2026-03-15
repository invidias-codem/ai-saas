
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { listMemories } from '@/lib/memory/vectorStore';

export async function GET(req: Request) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const limit = parseInt(searchParams.get('limit') || '20');
        const offset = parseInt(searchParams.get('offset') || '0');

        const memories = await listMemories(userId, limit, offset);

        return NextResponse.json({ success: true, memories });
    } catch (error) {
        console.error("Error listing memories:", error);
        return new NextResponse("Internal Error", { status: 500 });
    }
}
