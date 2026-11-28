export const MAX_CHAT_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_CHAT_IMAGES = 10;
export const MAX_CHAT_IMAGE_TOTAL_BYTES = 40 * 1024 * 1024;

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
  /** Compression metadata for upload pipeline */
  __compressed?: boolean;
  __encoding?: 'gzip' | 'lz-string';
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
