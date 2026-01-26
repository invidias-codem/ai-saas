
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs';
import { extractKnowledgeFromImport } from '@/lib/import/memoryExtractor';
import { storeImportedMemories, createImportJob, updateImportJob } from '@/lib/import/memoryStorage';

export const maxDuration = 300; // 5 minutes max for simple processing

export async function POST(req: Request) {
    try {
        const { userId } = auth();
        if (!userId) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        const { importData, options, jobId: providedJobId } = await req.json();

        if (!importData || !importData.conversations) {
            return new NextResponse("Invalid import data", { status: 400 });
        }

        // Add size validation
        const MAX_CONVERSATIONS_PER_BATCH = 50;
        const MAX_MESSAGES_PER_CONVERSATION = 500;

        if (importData.conversations.length > MAX_CONVERSATIONS_PER_BATCH) {
            return new NextResponse(
                `Batch too large. Maximum ${MAX_CONVERSATIONS_PER_BATCH} conversations per request.`,
                { status: 400 }
            );
        }

        const hasOversizedConversation = importData.conversations.some(
            (conv: any) => conv.messages?.length > MAX_MESSAGES_PER_CONVERSATION
        );
        if (hasOversizedConversation) {
            return new NextResponse(
                `Conversation too large. Maximum ${MAX_MESSAGES_PER_CONVERSATION} messages per conversation.`,
                { status: 400 }
            );
        }

        let jobId = providedJobId;

        // Create job record only if not provided
        if (!jobId) {
            jobId = await createImportJob(
                userId,
                importData.source,
                // Note: If batching, this total might be just the first batch's length if client doesn't send total.
                // Ideal client sends total in options or first call.
                options?.totalConversations || importData.conversations.length,
                { fileName: options?.fileName }
            );
        }

        // Process extraction
        // Note: For very large imports, we might want to offload this to a queue
        // But for now, we process in-request (up to maxDuration)

        try {
            const knowledge = await extractKnowledgeFromImport(importData);

            // Store memories
            const memoryIds = await storeImportedMemories(userId, knowledge.facts);

            // Update user profile/preferences if needed (could be a separate call)
            // For now we just focus on storing the facts

            await updateImportJob(jobId, {
                status: 'processing', // Keep processing until client says done? Or client updates?
                // We'll trust the memoryStorage append logic or update stats incrementallly?
                // The current updateImportJob overwrites stats. We need to increment them.
                // For simplicity, let's assume the API handles the "chunk" logic or we improve updateImportJob.
                // Actually, let's make updateImportJob smart or just log error for now.
                // Let's just update the timestamp.
                // Real implementation needs atomic increments.
                completed_at: new Date().toISOString()
            });

            // We need to support atomic increments for accurate stats in DB if we want them.
            // But for now returning stats to client to aggregate is fine.

            return NextResponse.json({
                success: true,
                jobId,
                stats: {
                    facts: knowledge.facts.length,
                    memories: memoryIds.length,
                    topics: knowledge.topics.length
                }
            });

        } catch (processError: any) {
            console.error("Import processing failed:", processError);
            await updateImportJob(jobId, {
                status: 'failed',
                error_log: [{ message: processError.message, time: new Date().toISOString() }],
                completed_at: new Date().toISOString()
            });
            return NextResponse.json({ success: false, error: processError.message }, { status: 500 });
        }

    } catch (error) {
        console.error("[IMPORT_PROCESS]", error);
        return new NextResponse("Internal Error", { status: 500 });
    }
}
