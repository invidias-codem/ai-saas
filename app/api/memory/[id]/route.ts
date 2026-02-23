
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { deleteMemory, updateMemory } from '@/lib/memory/vectorStore';

export async function DELETE(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        const { id } = await params;
        const success = await deleteMemory(id, userId);

        if (!success) {
            return new NextResponse("Failed to delete memory", { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error deleting memory:", error);
        return new NextResponse("Internal Error", { status: 500 });
    }
}

export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        const { content } = await req.json();
        if (!content || typeof content !== 'string') {
            return new NextResponse("Invalid content", { status: 400 });
        }

        const { id } = await params;
        const success = await updateMemory(id, userId, content);

        if (!success) {
            return new NextResponse("Failed to update memory", { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error updating memory:", error);
        return new NextResponse("Internal Error", { status: 500 });
    }
}
