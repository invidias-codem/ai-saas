import { getStorageProjectId } from '@/lib/gcp/storage';
import { ValidationError } from '@/lib/security/inputValidation';
import type { FileAttachmentInput } from '@/lib/types/attachments';
import type { Attachment } from './types';

export function resolveConversationAttachment(
  request: { fileData?: FileAttachmentInput | string | null; fileName?: string; mimeType?: string; fileUri?: string },
  userId: string,
): Attachment | undefined {
  const { fileData } = request;
  const file = typeof fileData === 'string' ? { base64Data: fileData } : fileData;
  const mimeType = file?.mimeType || file?.type || request.mimeType;
  const base64Data = file?.base64Data;
  const fileUri = file?.fileUri || request.fileUri;

  if (!mimeType || (!base64Data && !fileUri)) return undefined;
  const name = file?.name || request.fileName || 'attached_file';
  if (base64Data) return { name, mimeType, base64Data };

  // Signed uploads are created under the authenticated user's GCS prefix.
  // Validate the reference before forwarding it to Gemini or Vertex.
  const prefix = `gs://genie-uploads-${getStorageProjectId()}/${userId}/`;
  const path = fileUri?.startsWith(prefix) ? fileUri.slice(prefix.length) : '';
  if (!/^[\w-]+\/(?!\.{1,2}$)[\w.-]+$/.test(path)) {
    throw new ValidationError('This attachment is unavailable. Remove it and attach the file again.');
  }
  return { name, mimeType, fileUri };
}
