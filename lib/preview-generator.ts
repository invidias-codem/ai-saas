import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { createHash } from 'crypto';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';

// Type for pdf-parse CJS dynamic require
interface PdfParseModule {
  default?: { new (options: any): { getText: () => Promise<{ total: number; text: string }>; destroy: () => Promise<void> } };
  PDFParse?: { new (options: any): { getText: () => Promise<{ total: number; text: string }>; destroy: () => Promise<void> } };
  // Allow it to be a constructor function directly
  [key: string]: any;
}

// Dynamic require for pdf-parse (CommonJS module without proper ESM exports)
function getPdfParse() {
  // Use require for the CJS module - this works in Node.js API routes
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pdfParseModule = require('pdf-parse') as PdfParseModule;
  // pdf-parse CJS exports PDFParse as named export
  const PDFParse = pdfParseModule.PDFParse || pdfParseModule.default;
  if (!PDFParse) {
    throw new Error('pdf-parse module does not export PDFParse class');
  }
  return PDFParse;
}

const execFileAsync = promisify(execFile);

export interface PreviewResult {
  type: 'image' | 'text' | 'pdf' | 'json' | 'error';
  data: string;
  metadata?: Record<string, any>;
  error?: string;
}

// Cache for generated previews (in-memory, could be Redis in production)
const previewCache = new Map<string, PreviewResult>();

function getCacheKey(buffer: Buffer, mimeType: string): string {
  const hash = createHash('sha256').update(buffer).digest('hex').slice(0, 16);
  return `${mimeType}:${hash}:${buffer.length}`;
}

/**
 * Generates a preview for a validated file buffer.
 * Returns base64-encoded images, text content, or PDF.js-compatible data.
 */
export async function generatePreview(
  buffer: Buffer,
  mimeType: string,
  filename: string
): Promise<PreviewResult> {
  const cacheKey = getCacheKey(buffer, mimeType);
  
  // Check cache first
  if (previewCache.has(cacheKey)) {
    return previewCache.get(cacheKey)!;
  }

  const tempDir = await fs.mkdtemp('/tmp/preview-');
  const ext = path.extname(filename) || getExtensionForMime(mimeType);
  const inputPath = path.join(tempDir, `input${ext}`);

  try {
    await fs.writeFile(inputPath, buffer);

    let result: PreviewResult;

    if (mimeType === 'application/pdf') {
      result = await previewPdf(inputPath, tempDir, buffer);
    } else if (mimeType.startsWith('image/')) {
      result = await previewImage(inputPath, mimeType, buffer);
    } else if (
      mimeType.startsWith('text/') ||
      mimeType === 'application/json' ||
      mimeType === 'application/yaml' ||
      mimeType === 'application/xml'
    ) {
      result = await previewText(buffer, mimeType);
    } else if (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      result = await previewDocx(inputPath, tempDir);
    } else if (mimeType === 'application/msword') {
      result = await previewDoc(inputPath, tempDir);
    } else if (
      mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ) {
      result = await previewXlsx(inputPath, tempDir);
    } else {
      result = {
        type: 'error',
        data: '',
        error: `No preview generator for ${mimeType}`,
      };
    }

    // Cache successful results
    if (result.type !== 'error') {
      previewCache.set(cacheKey, result);
      // Limit cache size
      if (previewCache.size > 100) {
        const firstKey = previewCache.keys().next().value;
        if (firstKey) previewCache.delete(firstKey);
      }
    }

    return result;
  } catch (error: any) {
    console.error('[PreviewGenerator] Error:', error);
    return {
      type: 'error',
      data: '',
      error: error.message || 'Preview generation failed',
    };
  } finally {
    // Cleanup temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}

async function previewPdf(inputPath: string, tempDir: string, originalBuffer: Buffer): Promise<PreviewResult> {
  // Try server-side rendering first (poppler/pdftoppm)
  try {
    const outputPath = path.join(tempDir, 'page');
    await execFileAsync('pdftoppm', [
      '-png',
      '-singlefile',
      '-r', '150', // 150 DPI for good quality
      '-scale-to', '1200', // Max width 1200px
      inputPath,
      outputPath,
    ], {
      timeout: 15000,
      maxBuffer: 20 * 1024 * 1024,
    });

    const pngPath = `${outputPath}-1.png`;
    const pngBuffer = await fs.readFile(pngPath);
    
    // Also get page count and text preview for metadata
    let pageCount = 1;
    let textPreview = '';
    try {
      // Use pdf-parse if available
      const PDFParse = getPdfParse() as new (options: any) => { getText: () => Promise<{ total: number; text: string }>; destroy: () => Promise<void> };
      const parser = new PDFParse({ data: originalBuffer });
      const parsed = await parser.getText();
      pageCount = parsed.total || 1;
      textPreview = parsed.text?.slice(0, 500) || '';
      await parser.destroy();
    } catch {
      // pdf-parse optional, use default
    }

    return {
      type: 'image',
      data: `data:image/png;base64,${pngBuffer.toString('base64')}`,
      metadata: { pageCount, textPreview, generator: 'pdftoppm' },
    };
  } catch (err) {
    // Fallback: return data for client-side pdf.js rendering
    console.warn('[PreviewGenerator] pdftoppm failed, falling back to pdf.js:', err);

    let pageCount = 1;
    let textPreview = '';
    try {
      const PDFParse = getPdfParse() as new (options: any) => { getText: () => Promise<{ total: number; text: string }>; destroy: () => Promise<void> };
      const parser = new PDFParse({ data: originalBuffer });
      const parsed = await parser.getText();
      pageCount = parsed.total || 1;
      textPreview = parsed.text?.slice(0, 500) || '';
      await parser.destroy();
    } catch {}

    return {
      type: 'pdf',
      data: `data:application/pdf;base64,${originalBuffer.toString('base64')}`,
      metadata: { pageCount, textPreview, fallback: true },
    };
  }
}

async function previewImage(inputPath: string, mimeType: string, buffer: Buffer): Promise<PreviewResult> {
  // For images, return base64 data URL directly
  // Optionally: resize large images server-side
  const maxDimension = 2000;
  
  try {
    // Check if we need to resize (using imagemagick if available)
    const { width, height } = getImageDimensions(buffer, mimeType) || { width: 0, height: 0 };
    
    if (width > maxDimension || height > maxDimension) {
      const outputPath = path.join(path.dirname(inputPath), 'resized.jpg');
      await execFileAsync('convert', [
        inputPath,
        '-auto-orient',
        '-resize', `${maxDimension}x${maxDimension}>`,
        '-quality', '85',
        outputPath,
      ], { timeout: 10000 });
      
      const resizedBuffer = await fs.readFile(outputPath);
      return {
        type: 'image',
        data: `data:image/jpeg;base64,${resizedBuffer.toString('base64')}`,
        metadata: { originalWidth: width, originalHeight: height, resized: true },
      };
    }
  } catch {
    // If convert fails, use original
  }

  return {
    type: 'image',
    data: `data:${mimeType};base64,${buffer.toString('base64')}`,
    metadata: {},
  };
}

async function previewText(buffer: Buffer, mimeType: string): Promise<PreviewResult> {
  const text = buffer.toString('utf-8');
  const maxChars = 100000; // 100KB text limit
  
  return {
    type: 'text',
    data: text.slice(0, maxChars),
    metadata: {
      truncated: text.length > maxChars,
      totalChars: text.length,
      lines: text.split('\n').length,
    },
  };
}

async function previewDocx(inputPath: string, tempDir: string): Promise<PreviewResult> {
  try {
    const result = await mammoth.extractRawText({ path: inputPath });
    
    return {
      type: 'text',
      data: result.value.slice(0, 50000),
      metadata: {
        messages: result.messages,
        generator: 'mammoth',
      },
    };
  } catch (err) {
    console.error('[PreviewGenerator] DOCX preview failed:', err);
    return {
      type: 'error',
      data: '',
      error: 'Failed to parse DOCX file',
    };
  }
}

async function previewDoc(inputPath: string, tempDir: string): Promise<PreviewResult> {
  // For legacy .doc files, try converting to text via antiword or libreoffice
  try {
    const outputPath = path.join(tempDir, 'converted.txt');
    await execFileAsync('antiword', [inputPath], { timeout: 10000 });
    // antiword outputs to stdout
    // This is a simplified version - would need proper handling
    return {
      type: 'text',
      data: '[Legacy DOC format - preview requires antiword or LibreOffice]',
      metadata: { generator: 'antiword' },
    };
  } catch {
    return {
      type: 'error',
      data: '',
      error: 'Legacy DOC format not supported (install antiword or LibreOffice)',
    };
  }
}

async function previewXlsx(inputPath: string, tempDir: string): Promise<PreviewResult> {
  try {
    // Use xlsx library to parse
    const workbook = XLSX.readFile(inputPath);
    const sheetNames = workbook.SheetNames;

    let output = '';
    for (const sheetName of sheetNames.slice(0, 5)) { // Max 5 sheets
      const sheet = workbook.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(sheet);
      output += `=== ${sheetName} ===\n${csv}\n\n`;
    }

    return {
      type: 'text',
      data: output.slice(0, 50000),
      metadata: { sheets: sheetNames.length, generator: 'xlsx' },
    };
  } catch (err) {
    console.error('[PreviewGenerator] XLSX preview failed:', err);
    return {
      type: 'error',
      data: '',
      error: 'Failed to parse XLSX file',
    };
  }
}

function getImageDimensions(buffer: Buffer, mimeType: string): { width: number; height: number } | null {
  try {
    if (mimeType === 'image/png') {
      if (buffer.length < 24) return null;
      return {
        width: buffer.readUInt32BE(16),
        height: buffer.readUInt32BE(20),
      };
    }
    if (mimeType === 'image/jpeg') {
      let i = 2;
      while (i < buffer.length - 1) {
        if (buffer[i] !== 0xff) return null;
        const marker = buffer[i + 1];
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          if (i + 7 >= buffer.length) return null;
          return {
            height: buffer.readUInt16BE(i + 3),
            width: buffer.readUInt16BE(i + 5),
          };
        }
        const length = buffer.readUInt16BE(i + 2);
        i += 2 + length;
      }
    }
    if (mimeType === 'image/gif') {
      if (buffer.length < 10) return null;
      return {
        width: buffer.readUInt16LE(6),
        height: buffer.readUInt16LE(8),
      };
    }
    if (mimeType === 'image/webp') {
      if (buffer.length < 30) return null;
      if (buffer[12] === 0x56 && buffer[13] === 0x50 && buffer[14] === 0x38) {
        return {
          width: buffer.readUInt16LE(26),
          height: buffer.readUInt16LE(28),
        };
      }
    }
  } catch {
    return null;
  }
  return null;
}

function getExtensionForMime(mimeType: string): string {
  const map: Record<string, string> = {
    'application/pdf': '.pdf',
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/svg+xml': '.svg',
    'text/plain': '.txt',
    'text/markdown': '.md',
    'text/csv': '.csv',
    'application/json': '.json',
    'application/xml': '.xml',
    'application/yaml': '.yaml',
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  };
  return map[mimeType] || '.bin';
}