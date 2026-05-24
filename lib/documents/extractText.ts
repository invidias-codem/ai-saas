import { getDocumentProxy, extractText } from 'unpdf';

export interface ExtractedDocument {
  text: string;
  metadata?: Record<string, any>;
}

/**
 * Extracts raw text from a document Buffer.
 * Supports PDF, TXT, and MD formats.
 * @param buffer The file buffer
 * @param mimeType The file mime type
 */
export async function extractDocumentText(buffer: Buffer, mimeType: string): Promise<ExtractedDocument> {
  if (mimeType === 'application/pdf') {
    return extractPdfText(buffer);
  } else if (
    mimeType === 'text/plain' || 
    mimeType === 'text/markdown' || 
    mimeType === 'text/csv' ||
    mimeType === 'application/json'
  ) {
    // For raw text formats, decode from utf-8
    const text = buffer.toString('utf-8');
    return { text };
  } else {
    throw new Error(`Unsupported mime type for text extraction: ${mimeType}`);
  }
}

async function extractPdfText(buffer: Buffer): Promise<ExtractedDocument> {
  try {
    const data = new Uint8Array(buffer);
    const pdf = await getDocumentProxy(data);
    const { text, info } = await extractText(pdf);

    return {
      text,
      metadata: {
        pages: pdf.numPages,
        author: info?.Author,
        creator: info?.Creator,
        producer: info?.Producer,
        creationDate: info?.CreationDate
      }
    };
  } catch (error: any) {
    console.error('[ExtractText] PDF Extraction Failed:', error);
    throw new Error(`Failed to extract text from PDF: ${error.message}`);
  }
}
