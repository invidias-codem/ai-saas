// lib/fileProcessing/pdfExtractor.ts
// PDF text extraction for the conversation engine.
// Uses pdf-parse (Node.js) for reliable server-side text extraction.

import type { FileAttachmentInput } from '@/lib/types/attachments';

/**
 * Extract text from a PDF file.
 * Supports both base64-encoded data and GCS file URIs.
 */
export async function extractPdfText(fileData: FileAttachmentInput): Promise<string> {
  // Dynamic import to avoid bundling pdf-parse in client code
  const pdfParse = (await import('pdf-parse')).default;

  let buffer: Buffer;

  if (fileData.base64Data) {
    buffer = Buffer.from(fileData.base64Data, 'base64');
  } else if (fileData.fileUri?.startsWith('gs://')) {
    const { getStorageClient, getStorageProjectId } = await import('@/lib/gcp/storage');
    const storage = getStorageClient();
    const projectId = getStorageProjectId();
    const bucketName = `genie-uploads-${projectId}`;
    const filePath = fileData.fileUri.replace(`gs://${bucketName}/`, '');
    const [fileContents] = await storage.bucket(bucketName).file(filePath).download();
    buffer = fileContents;
  } else {
    throw new Error('PDF extraction requires base64Data or gs:// fileUri');
  }

  const data = await pdfParse(buffer);
  return data.text;
}

/**
 * Check if a file is a PDF based on MIME type or filename.
 */
export function isPdf(fileData: FileAttachmentInput): boolean {
  if (fileData.mimeType === 'application/pdf') return true;
  if (fileData.name?.toLowerCase().endsWith('.pdf')) return true;
  return false;
}

/**
 * Extract text from a file if it's a PDF, otherwise return null.
 */
export async function extractTextIfPdf(fileData: FileAttachmentInput): Promise<string | null> {
  if (!isPdf(fileData)) return null;

  try {
    const text = await extractPdfText(fileData);
    // Limit to 50k tokens worth of text (~200k chars) to avoid context window overflow
    const MAX_CHARS = 200_000;
    if (text.length > MAX_CHARS) {
      console.warn(`[PdfExtractor] Truncating PDF text from ${text.length} to ${MAX_CHARS} chars`);
      return text.slice(0, MAX_CHARS) + '\n\n[Document truncated due to length...]';
    }
    return text;
  } catch (err) {
    console.error('[PdfExtractor] Failed to extract PDF text:', err);
    return null;
  }
}
