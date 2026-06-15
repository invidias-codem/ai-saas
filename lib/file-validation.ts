import { fileTypeFromBuffer } from 'file-type';

/**
 * File validation utility for safe preview generation.
 * Validates file type, size, and checks for malicious content before preview generation.
 */

// Allowed MIME types for preview generation
export const ALLOWED_MIME_TYPES: Record<string, string[]> = {
  // Documents
  'application/pdf': ['.pdf'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'text/plain': ['.txt', '.md', '.markdown'],
  'text/csv': ['.csv'],
  'text/markdown': ['.md', '.markdown'],
  'application/json': ['.json'],
  'application/rtf': ['.rtf'],
  // Images
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/gif': ['.gif'],
  'image/webp': ['.webp'],
  'image/svg+xml': ['.svg'],
  'image/bmp': ['.bmp'],
  'image/tiff': ['.tiff', '.tif'],
  // Code/Text files
  'text/javascript': ['.js', '.jsx', '.mjs'],
  'text/typescript': ['.ts', '.tsx'],
  'text/html': ['.html', '.htm'],
  'text/css': ['.css'],
  'text/x-python': ['.py'],
  'text/x-go': ['.go'],
  'text/x-rust': ['.rs'],
  'text/x-java': ['.java'],
  'text/x-c': ['.c', '.h'],
  'text/x-c++': ['.cpp', '.cc', '.hpp'],
  'application/xml': ['.xml'],
  'application/yaml': ['.yaml', '.yml'],
  'text/x-shellscript': ['.sh', '.bash', '.zsh'],
  // Data
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.ms-excel': ['.xls'],
};

// Dangerous extensions that should never be previewed
export const DANGEROUS_EXTENSIONS = new Set([
  // Executables
  '.exe', '.bat', '.cmd', '.scr', '.com', '.pif', '.msi', '.msp',
  '.app', '.dmg', '.pkg', '.deb', '.rpm', '.apk', '.ipa',
  // Scripts
  '.sh', '.bash', '.zsh', '.ps1', '.vbs', '.js', '.jar', '.py', '.php',
  '.asp', '.aspx', '.jsp', '.pl', '.rb', '.lua',
  // System
  '.dll', '.so', '.dylib', '.ko', '.sys', '.drv',
  // Archives (can contain executables)
  '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz', '.tgz',
  // Disk images
  '.iso', '.img', '.vhd', '.vmdk',
  // Certificates/keys
  '.pem', '.key', '.crt', '.cer', '.pfx', '.p12',
  // Config that could be sensitive
  '.env', '.env.local', '.env.production', '.pem', '.ppk',
]);

// Maximum file size for preview (50MB)
export const MAX_PREVIEW_SIZE = 50 * 1024 * 1024;

// Polyglot signatures to detect embedded executables
const POLYGLOT_SIGNATURES: Record<string, Buffer[]> = {
  'application/pdf': [
    Buffer.from([0x50, 0x4B, 0x03, 0x04]), // ZIP embedded in PDF
    Buffer.from([0x50, 0x4B, 0x05, 0x06]), // ZIP end of central directory
    Buffer.from([0x50, 0x4B, 0x07, 0x08]), // ZIP spanned
  ],
  'image/jpeg': [
    Buffer.from([0x50, 0x4B, 0x03, 0x04]), // ZIP embedded in JPEG
  ],
  'image/png': [
    Buffer.from([0x50, 0x4B, 0x03, 0x04]), // ZIP embedded in PNG
  ],
};

export interface ValidationResult {
  safe: boolean;
  mimeType: string | null;
  extension: string;
  reason?: string;
  fileSize: number;
}

/**
 * Validates a file buffer for safe preview generation.
 * @param buffer - The file buffer to validate
 * @param filename - Original filename (used for extension check)
 * @returns ValidationResult with safety status and detected MIME type
 */
export async function validateFile(
  buffer: Buffer,
  filename: string
): Promise<ValidationResult> {
  const fileSize = buffer.length;
  const extension = filename.toLowerCase().slice(filename.lastIndexOf('.'));

  // 1. Check extension against dangerous list
  if (DANGEROUS_EXTENSIONS.has(extension)) {
    return {
      safe: false,
      mimeType: null,
      extension,
      reason: `Dangerous file extension: ${extension}`,
      fileSize,
    };
  }

  // 2. Check file size
  if (fileSize > MAX_PREVIEW_SIZE) {
    return {
      safe: false,
      mimeType: null,
      extension,
      reason: `File too large: ${(fileSize / 1024 / 1024).toFixed(1)}MB (max 50MB)`,
      fileSize,
    };
  }

  // 3. Magic bytes detection (real MIME type)
  const fileType = await fileTypeFromBuffer(buffer);
  if (!fileType) {
    return {
      safe: false,
      mimeType: null,
      extension,
      reason: 'Unknown or unsupported file type',
      fileSize,
    };
  }

  const mimeType = fileType.mime;

  // 4. Check if MIME type is in allowlist
  const allowedExts = ALLOWED_MIME_TYPES[mimeType];
  if (!allowedExts) {
    return {
      safe: false,
      mimeType,
      extension,
      reason: `MIME type not allowed for preview: ${mimeType}`,
      fileSize,
    };
  }

  // 5. Verify extension matches MIME type (basic check)
  if (!allowedExts.includes(extension)) {
    // Allow some common mismatches (e.g., .md for text/markdown)
    const isCommonMismatch =
      (extension === '.md' && mimeType === 'text/plain') ||
      (extension === '.markdown' && mimeType === 'text/plain') ||
      (extension === '.txt' && mimeType === 'text/markdown');

    if (!isCommonMismatch) {
      return {
        safe: false,
        mimeType,
        extension,
        reason: `Extension ${extension} doesn't match detected type ${mimeType}`,
        fileSize,
      };
    }
  }

  // 6. Check for polyglots (embedded executables/payloads)
  if (hasEmbeddedPayload(buffer, mimeType)) {
    return {
      safe: false,
      mimeType,
      extension,
      reason: 'Embedded executable or archive detected',
      fileSize,
    };
  }

  // 7. Basic content sanity checks
  const contentCheck = await checkContentSanity(buffer, mimeType);
  if (!contentCheck.safe) {
    return {
      safe: false,
      mimeType,
      extension,
      reason: contentCheck.reason,
      fileSize,
    };
  }

  return {
    safe: true,
    mimeType,
    extension,
    fileSize,
  };
}

/**
 * Checks for embedded payloads (polyglots) in file buffers.
 */
function hasEmbeddedPayload(buffer: Buffer, mimeType: string): boolean {
  const signatures = POLYGLOT_SIGNATURES[mimeType];
  if (!signatures) return false;

  for (const sig of signatures) {
    if (buffer.includes(sig)) {
      return true;
    }
  }
  return false;
}

/**
 * Performs basic content sanity checks based on file type.
 */
async function checkContentSanity(
  buffer: Buffer,
  mimeType: string
): Promise<{ safe: boolean; reason?: string }> {
  // For text files, check for null bytes (binary content in text file)
  if (mimeType.startsWith('text/') || mimeType === 'application/json') {
    if (buffer.includes(0x00)) {
      return { safe: false, reason: 'Null bytes detected in text file' };
    }
    // Check if it's valid UTF-8
    try {
      buffer.toString('utf-8');
    } catch {
      return { safe: false, reason: 'Invalid UTF-8 encoding' };
    }
  }

  // For PDFs, basic header check
  if (mimeType === 'application/pdf') {
    const header = buffer.slice(0, 5).toString();
    if (!header.startsWith('%PDF')) {
      return { safe: false, reason: 'Invalid PDF header' };
    }
  }

  // For images, basic dimension check (prevent decompression bombs)
  if (mimeType.startsWith('image/')) {
    const dims = getImageDimensions(buffer, mimeType);
    if (dims && (dims.width > 30000 || dims.height > 30000 || dims.width * dims.height > 100_000_000)) {
      return { safe: false, reason: 'Image dimensions too large (potential decompression bomb)' };
    }
  }

  return { safe: true };
}

/**
 * Extracts image dimensions from buffer for supported formats.
 */
function getImageDimensions(
  buffer: Buffer,
  mimeType: string
): { width: number; height: number } | null {
  try {
    if (mimeType === 'image/png') {
      // PNG: IHDR chunk at offset 8
      if (buffer.length < 24) return null;
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);
      return { width, height };
    }
    if (mimeType === 'image/jpeg') {
      // JPEG: parse SOF markers
      let i = 2;
      while (i < buffer.length - 1) {
        if (buffer[i] !== 0xff) return null;
        const marker = buffer[i + 1];
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          if (i + 7 >= buffer.length) return null;
          const height = buffer.readUInt16BE(i + 3);
          const width = buffer.readUInt16BE(i + 5);
          return { width, height };
        }
        const length = buffer.readUInt16BE(i + 2);
        i += 2 + length;
      }
    }
    if (mimeType === 'image/gif') {
      if (buffer.length < 10) return null;
      const width = buffer.readUInt16LE(6);
      const height = buffer.readUInt16LE(8);
      return { width, height };
    }
    if (mimeType === 'image/webp') {
      if (buffer.length < 30) return null;
      // VP8/VP8L format
      if (buffer[12] === 0x56 && buffer[13] === 0x50 && buffer[14] === 0x38) {
        const width = buffer.readUInt16LE(26);
        const height = buffer.readUInt16LE(28);
        return { width, height };
      }
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Gets the preview generator type for a MIME type.
 */
export function getPreviewGeneratorType(mimeType: string): PreviewGeneratorType {
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('text/') ||
      mimeType === 'application/json' ||
      mimeType === 'application/yaml' ||
      mimeType === 'application/xml') return 'text';
  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
  if (mimeType === 'application/msword') return 'doc';
  if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return 'xlsx';
  return 'unknown';
}

export type PreviewGeneratorType =
  | 'pdf'
  | 'image'
  | 'text'
  | 'docx'
  | 'doc'
  | 'xlsx'
  | 'unknown';