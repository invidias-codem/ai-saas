// lib/fileProcessing/pdfExtractor.ts
// PDF text extraction for the conversation engine.
// Uses pdfjs-dist (PDF.js) — the most reliable server-side PDF parser.

import type { FileAttachmentInput } from '@/lib/types/attachments';

/**
 * Extraction metrics for telemetry
 */
export interface PdfExtractionMetrics {
  fileName?: string;
  fileSizeBytes?: number;
  pageCount: number;
  charCount: number;
  truncated: boolean;
  extractionTimeMs: number;
}

/**
 * Extract text from a PDF file using pdfjs-dist.
 * Supports both base64-encoded data and GCS file URIs.
 */
async function extractWithPdfjs(fileData: FileAttachmentInput): Promise<string> {
  const pdfjs = await import('pdfjs-dist/build/pdf.min.mjs');
  
  // Disable worker for server-side rendering
  pdfjs.GlobalWorkerOptions.workerSrc = '';

  let uint8Array: Uint8Array;

  if (fileData.base64Data) {
    const binaryString = atob(fileData.base64Data);
    uint8Array = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      uint8Array[i] = binaryString.charCodeAt(i);
    }
  } else if (fileData.fileUri?.startsWith('gs://')) {
    const { getStorageClient, getStorageProjectId } = await import('@/lib/gcp/storage');
    const storage = getStorageClient();
    const projectId = getStorageProjectId();
    const bucketName = `genie-uploads-${projectId}`;
    const filePath = fileData.fileUri.replace(`gs://${bucketName}/`, '');
    const [fileContents] = await storage.bucket(bucketName).file(filePath).download();
    uint8Array = new Uint8Array(fileContents);
  } else {
    throw new Error('PDF extraction requires base64Data or gs:// fileUri');
  }

  const pdf = await pdfjs.getDocument({ data: uint8Array }).promise;
  const textParts: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .filter((item: any) => 'str' in item)
      .map((item: any) => item.str)
      .join(' ');
    textParts.push(pageText);
  }

  return textParts.join('\n\n');
}

/**
 * Extract text from a PDF file.
 * Supports both base64-encoded data and GCS file URIs.
 */
export async function extractPdfText(fileData: FileAttachmentInput): Promise<string> {
  return extractWithPdfjs(fileData);
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
 * Returns metrics about the extraction for observability.
 */
export async function extractTextIfPdf(fileData: FileAttachmentInput): Promise<{ text: string | null; metrics: PdfExtractionMetrics | null }> {
  if (!isPdf(fileData)) return { text: null, metrics: null };

  const startTime = Date.now();
  const fileSizeBytes = fileData.base64Data 
    ? Math.round(fileData.base64Data.length * 0.75) 
    : fileData.sizeBytes;

  try {
    const text = await extractPdfText(fileData);
    const extractionTimeMs = Date.now() - startTime;
    
    // Limit to 50k tokens worth of text (~200k chars) to avoid context window overflow
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
      pageCount: 0, // Could be extracted from pdf.numPages if we refactor
      charCount: finalText.length,
      truncated,
      extractionTimeMs,
    };

    console.log(`[PdfExtractor] Extraction complete: ${finalText.length} chars in ${extractionTimeMs}ms`);
    
    return { text: finalText, metrics };
  } catch (err) {
    const extractionTimeMs = Date.now() - startTime;
    console.error('[PdfExtractor] Failed to extract PDF text:', err);
    
    const metrics: PdfExtractionMetrics = {
      fileName: fileData.name,
      fileSizeBytes,
      pageCount: 0,
      charCount: 0,
      truncated: false,
      extractionTimeMs,
    };
    
    return { text: null, metrics };
  }
}
