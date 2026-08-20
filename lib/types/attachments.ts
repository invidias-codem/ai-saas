export interface FileAttachmentInput {
  name?: string;
  type?: string;
  mimeType?: string;
  sizeBytes?: number;
  base64Data?: string;
  fileUri?: string;
  storageProvider?: 'gcs';
  /** Pre-extracted text content (e.g., from PDF parsing) */
  extractedText?: string;
}

export interface ResolvedAttachment {
  source: 'inline' | 'gcs';
  name?: string;
  mimeType?: string;
  sizeBytes?: number;
  fileUri?: string;
  textContent?: string;
  base64Data?: string;
  isBinary: boolean;
}
