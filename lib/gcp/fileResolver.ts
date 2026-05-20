import { getStorageClient } from '@/lib/gcp/storage';
import type { FileAttachmentInput, ResolvedAttachment } from '@/lib/types/attachments';

const TEXT_LIKE_MIME_PREFIXES = ['text/'];
const TEXT_LIKE_MIME_TYPES = new Set([
  'application/json',
  'application/xml',
  'application/javascript',
  'application/typescript',
  'application/x-sh',
  'application/x-httpd-php',
  'application/x-yaml',
  'image/svg+xml',
]);

function isTextLikeMimeType(mimeType?: string): boolean {
  if (!mimeType) return false;
  return TEXT_LIKE_MIME_PREFIXES.some(prefix => mimeType.startsWith(prefix)) || TEXT_LIKE_MIME_TYPES.has(mimeType);
}

function parseGsUri(fileUri: string): { bucket: string; path: string } {
  if (!fileUri.startsWith('gs://')) {
    throw new Error(`Unsupported fileUri format: ${fileUri}`);
  }

  const withoutScheme = fileUri.slice('gs://'.length);
  const slashIndex = withoutScheme.indexOf('/');
  if (slashIndex === -1) {
    throw new Error(`Invalid gs:// URI, missing object path: ${fileUri}`);
  }

  const bucket = withoutScheme.slice(0, slashIndex);
  const path = withoutScheme.slice(slashIndex + 1);

  if (!bucket || !path) {
    throw new Error(`Invalid gs:// URI: ${fileUri}`);
  }

  return { bucket, path };
}

export async function resolveAttachmentForAnalysis(
  attachment: FileAttachmentInput
): Promise<ResolvedAttachment> {
  const mimeType = attachment.mimeType || attachment.type || 'application/octet-stream';
  const name = attachment.name;
  const sizeBytes = attachment.sizeBytes;

  if (attachment.base64Data) {
    const isBinary = !isTextLikeMimeType(mimeType);
    let textContent: string | undefined;

    if (!isBinary) {
      textContent = Buffer.from(attachment.base64Data, 'base64').toString('utf-8');
    }

    return {
      source: 'inline',
      name,
      mimeType,
      sizeBytes,
      base64Data: attachment.base64Data,
      textContent,
      isBinary,
    };
  }

  if (attachment.fileUri) {
    const { bucket, path } = parseGsUri(attachment.fileUri);
    const storage = getStorageClient();
    const [buffer] = await storage.bucket(bucket).file(path).download();
    const detectedSize = buffer.byteLength;
    const isBinary = !isTextLikeMimeType(mimeType);

    return {
      source: 'gcs',
      name,
      mimeType,
      sizeBytes: sizeBytes || detectedSize,
      fileUri: attachment.fileUri,
      textContent: isBinary ? undefined : buffer.toString('utf-8'),
      isBinary,
    };
  }

  throw new Error('Attachment must include either base64Data or fileUri');
}
