// lib/fileProcessing/pdfExtractor.ts
// PDF text extraction for the conversation engine.
// Uses pdfjs-dist (PDF.js) — the most reliable server-side PDF parser.

import type { FileAttachmentInput } from '@/lib/types/attachments';

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
