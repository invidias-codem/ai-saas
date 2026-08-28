import LZString from 'lz-string';

export type FileUploadPayload = {
  name?: string;
  type?: string;
  mimeType?: string;
  sizeBytes?: number;
  base64Data?: string;
  fileUri?: string;
  storageProvider?: string;
  extractedText?: string;
};

const COMPRESSION_THRESHOLD = 64 * 1024; // compress base64 uploads >64KB

export function compressBase64Payload(payload: FileUploadPayload): FileUploadPayload {
  if (!payload?.base64Data || payload.base64Data.length < COMPRESSION_THRESHOLD) {
    return payload;
  }

  try {
    const compressedBase64 = LZString.compressToBase64(payload.base64Data);

    return {
      ...payload,
      base64Data: compressedBase64,
      __compressed: true,
      __encoding: 'lz-string',
    };
  } catch (err) {
    console.warn('[uploadCompression] compression failed, sending raw', err);
    return payload;
  }
}

export function decompressLzStringPayload(payload: FileUploadPayload): FileUploadPayload {
  if (!payload?.base64Data || payload.__compressed !== true || payload.__encoding !== 'lz-string') {
    return payload;
  }

  try {
    const decompressed = LZString.decompressFromBase64(payload.base64Data);
    if (typeof decompressed !== 'string') {
      throw new Error('[uploadCompression] decompression returned non-string');
    }

    return {
      ...payload,
      base64Data: decompressed,
      __compressed: undefined,
      __encoding: undefined,
    };
  } catch (err) {
    console.error('[uploadCompression] decompression failed', err);
    throw err;
  }
}
