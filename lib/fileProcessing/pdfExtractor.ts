// lib/fileProcessing/pdfExtractor.ts
// PDF text extraction for the conversation engine.
// Uses unpdf — a modern, serverless-safe PDF.js wrapper with zero native dependencies.
// Built specifically for Next.js App Router and edge environments.

import type { FileAttachmentInput } from '@/lib/types/attachments';

export interface PdfExtractionMetrics {
  fileName?: string;
  fileSizeBytes?: number;
  charCount: number;
  truncated: boolean;
  extractionTimeMs: number;
}

async function extractWithUnpdf(fileData: FileAttachmentInput): Promise<string> {
  const { getDocumentProxy, extractText } = await import('unpdf');

  let uint8Array: Uint8Array;

  if (fileData.base64Data) {
    const buffer = Buffer.from(fileData.base64Data, 'base64');
    // Convert Buffer to plain Uint8Array (unpdf rejects Buffer subclasses)
    uint8Array = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  } else if (fileData.fileUri?.startsWith('gs://')) {
    const { getStorageClient, getStorageProjectId } = await import('@/lib/gcp/storage');
    const storage = getStorageClient();
    const projectId = getStorageProjectId();
    const bucketName = `genie-uploads-${projectId}`;
    const filePath = fileData.fileUri.replace(`gs://${bucketName}/`, '');
    const [fileContents] = await storage.bucket(bucketName).file(filePath).download();
    uint8Array = new Uint8Array(fileContents.buffer, fileContents.byteOffset, fileContents.byteLength);
  } else {
    throw new Error('PDF extraction requires base64Data or gs:// fileUri');
  }

  const pdf = await getDocumentProxy(uint8Array);
  const { text } = await extractText(pdf);
  // extractText returns { totalPages, text: string[] } where each element is a page
  return Array.isArray(text) ? text.join('\n\n') : text;
}

export async function extractPdfText(fileData: FileAttachmentInput): Promise<string> {
  return extractWithUnpdf(fileData);
}

export function isPdf(fileData: FileAttachmentInput): boolean {
  if (fileData.mimeType === 'application/pdf') return true;
  if (fileData.name?.toLowerCase().endsWith('.pdf')) return true;
  return false;
}

export async function extractTextIfPdf(fileData: FileAttachmentInput): Promise<{ text: string | null; metrics: PdfExtractionMetrics | null }> {
  if (!isPdf(fileData)) return { text: null, metrics: null };

  const startTime = Date.now();
  const fileSizeBytes = fileData.base64Data 
    ? Math.round(fileData.base64Data.length * 0.75) 
    : fileData.sizeBytes;

  try {
    const text = await extractPdfText(fileData);
    const extractionTimeMs = Date.now() - startTime;
    
    const MAX_CHARS = 200_000;
    let finalText = text;
    let truncated = false;
    
    if (text.length > MAX_CHARS) {
      finalText = text.slice(0, MAX_CHARS) + '\n\n[Document truncated due to length...]';
      truncated = true;
      console.warn(`[PdfExtractor] Truncating PDF text from ${text.length} to ${MAX_CHARS} chars`);
    }

    const metrics: PdfExtractionMetrics = {
      fileName: fileData.name,
      fileSizeBytes,
      charCount: finalText.length,
      truncated,
      extractionTimeMs,
    };

    console.log(`[PdfExtractor] Extraction complete: ${finalText.length} chars in ${extractionTimeMs}ms`);
    
    return { text: finalText, metrics };
  } catch (err) {
    const extractionTimeMs = Date.now() - startTime;
    console.error('[PdfExtractor] Failed to extract PDF text:', err);
    
    return { 
      text: null, 
      metrics: { fileName: fileData.name, fileSizeBytes, charCount: 0, truncated: false, extractionTimeMs }
    };
  }
}
