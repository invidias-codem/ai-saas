import { Client } from "@upstash/qstash";

// Initialize QStash client safely (fails gracefully if token is missing locally)
const qstash = process.env.QSTASH_TOKEN 
  ? new Client({ token: process.env.QSTASH_TOKEN })
  : null;

export async function enqueueArchivalTask(documentId: string) {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const targetUrl = `${baseUrl}/api/documents/worker`;

    if (!qstash) {
      console.warn(`[QStash] Missing QSTASH_TOKEN. In a real environment, document ${documentId} would be pushed to ${targetUrl}`);
      
      // Local fallback for testing without QStash: directly call the worker API route without waiting
      fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId })
      }).catch(err => console.error('[Local Queue Fallback] Error:', err));
      
      return { messageId: 'local-fallback-dev-mode' };
    }

    const res = await qstash.publishJSON({
      url: targetUrl,
      body: { documentId },
      retries: 3, // Built-in backoff for failed decompression attempts
    });
    
    console.log(`[QStash] Enqueued archival task for doc ${documentId}. Message ID: ${res.messageId}`);
    return res;
  } catch (error) {
    console.error("[QStash] Failed to enqueue archival task", error);
    throw error;
  }
}
