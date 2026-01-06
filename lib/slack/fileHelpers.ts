import axios from 'axios';
import { extractText } from 'unpdf';

/**
 * Supported file types for analysis
 */
export const SUPPORTED_FILE_TYPES = [
    'pdf',
    'text',
    'javascript',
    'typescript',
    'python',
    'java',
    'csharp',
    'cpp',
    'go',
    'ruby',
    'php',
    'swift',
    'kotlin',
    'scala',
    'html',
    'css',
    'json',
    'xml',
    'yaml',
    'markdown',
    'csv',
];

/**
 * Check if a file type is supported
 */
export function isSupportedFileType(fileType: string): boolean {
    return SUPPORTED_FILE_TYPES.includes(fileType.toLowerCase());
}

/**
 * Download a file from Slack
 * Slack files require Authorization header with the Bot Token
 */
export async function downloadSlackFile(
    url: string,
    token: string
): Promise<Buffer> {
    try {
        const response = await axios.get(url, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
            responseType: 'arraybuffer',
        });

        return Buffer.from(response.data);
    } catch (error) {
        console.error('[FILE_HELPERS] Error downloading file:', error);
        throw new Error('Failed to download file from Slack');
    }
}

/**
 * Extract text from a buffer based on file type
 */
export async function extractFileContent(
    buffer: Buffer,
    fileType: string,
    originalName: string
): Promise<string> {
    const type = fileType.toLowerCase();

    // Handle PDF
    if (type === 'pdf') {
        try {
            // unpdf requires Uint8Array, not Buffer
            const uint8Array = new Uint8Array(buffer);
            const { text } = await extractText(uint8Array);
            return Array.isArray(text) ? text.join('\n') : text;
        } catch (error) {
            console.error('[FILE_HELPERS] PDF parsing error:', error);
            throw new Error('Failed to parse PDF content');
        }
    }

    // Handle Text/Code (assume UTF-8)
    // Most code/text files can be read simply as strings
    return buffer.toString('utf-8');
}

/**
 * Interface for processed file data
 */
export interface ProcessedFile {
    name: string;
    type: string;
    content: string;
    tokenCount?: number; // Approximation
}
