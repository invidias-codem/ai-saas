import LZString from 'lz-string';

/**
 * Compresses a string using LZ-string (compatible with UTF-16).
 * optimized for storage in localStorage or sending via network.
 */
export function compress(text: string): string {
    if (!text) return '';
    return LZString.compressToUTF16(text);
}

/**
 * Decompresses a string compressed with compress().
 * Handles legacy uncompressed data gracefully by checking validity.
 */
export function decompress(compressedText: string): string {
    if (!compressedText) return '';

    // Try to decompress
    try {
        const decompressed = LZString.decompressFromUTF16(compressedText);

        // If null, it might be uncompressed data (legacy) or invalid
        if (decompressed === null) {
            // Heuristic: If it looks like valid text, return as is (backward compatibility)
            // This assumes we don't store "null" string literally.
            return compressedText;
        }
        return decompressed;
    } catch (error) {
        console.warn('Decompression failed, returning original text:', error);
        return compressedText;
    }
}

/**
 * Compresses an object/array by JSON stringifying then compressing.
 */
export function compressObject(data: any): string {
    try {
        const jsonString = JSON.stringify(data);
        return compress(jsonString);
    } catch (error) {
        console.error('Object compression failed:', error);
        return '';
    }
}

/**
 * Decompresses a string back into an object/array.
 */
export function decompressObject<T>(compressedData: string): T | null {
    try {
        const jsonString = decompress(compressedData);
        if (!jsonString) return null;
        return JSON.parse(jsonString) as T;
    } catch (error) {
        console.error('Object decompression failed:', error);
        return null;
    }
}
