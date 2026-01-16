import LZString from 'lz-string';

/**
 * Compression utility using lz-string for text optimization.
 * Primarily used for database storage to reduce storage costs.
 * 
 * IMPORTANT: Network transport should use native HTTP compression (Brotli/Gzip)
 * instead of this library to avoid main-thread blocking.
 */

/**
 * Prefix marker to identify compressed strings explicitly.
 * This enables safe migration from uncompressed to compressed data.
 */
const PREFIX = '::LZ::';

/**
 * Compresses a string using LZ-String UTF-16 encoding with a prefix marker.
 * @param text - The text to compress
 * @returns Compressed string with ::LZ:: prefix
 */
export function compress(text: string): string {
    if (!text) return '';
    const compressed = LZString.compressToUTF16(text);
    return PREFIX + compressed;
}

/**
 * Safely decompresses a string that may or may not be compressed.
 * Handles migration from legacy uncompressed data gracefully.
 * 
 * @param text - The potentially compressed string
 * @returns Decompressed string, or original if not compressed
 */
export function safeDecompress(text: string): string {
    if (!text) return '';

    // Check for explicit compression marker
    if (text.startsWith(PREFIX)) {
        const compressedData = text.slice(PREFIX.length);
        const decompressed = LZString.decompressFromUTF16(compressedData);
        return decompressed || ''; // Return empty string if decompression fails
    }

    // Assume uncompressed (legacy data)
    return text;
}

/**
 * @deprecated Use safeDecompress instead for safer migration handling
 */
export function decompress(compressed: string): string {
    return safeDecompress(compressed);
}

/**
 * Compresses a JavaScript object by stringifying and compressing it.
 * @deprecated For storage only. Do not use for network transport.
 */
export function compressObject<T = any>(obj: T): string {
    try {
        const jsonString = JSON.stringify(obj);
        return compress(jsonString);
    } catch (error) {
        console.error('Object compression failed:', error);
        return '';
    }
}

/**
 * Decompresses a string back into an object/array.
 * @deprecated For storage only. Do not use for network transport.
 */
export function decompressObject<T>(compressedData: string): T | null {
    try {
        const jsonString = safeDecompress(compressedData);
        if (!jsonString) return null;
        return JSON.parse(jsonString) as T;
    } catch (error) {
        console.error('Object decompression failed:', error);
        return null;
    }
}
