"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.compress = compress;
exports.safeDecompress = safeDecompress;
exports.decompress = decompress;
exports.compressObject = compressObject;
exports.decompressObject = decompressObject;
const LZString = __importStar(require("lz-string"));
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
function compress(text) {
    if (!text)
        return '';
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
function safeDecompress(text) {
    if (!text)
        return '';
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
function decompress(compressed) {
    return safeDecompress(compressed);
}
/**
 * Compresses a JavaScript object by stringifying and compressing it.
 * @deprecated For storage only. Do not use for network transport.
 */
function compressObject(obj) {
    try {
        const jsonString = JSON.stringify(obj);
        return compress(jsonString);
    }
    catch (error) {
        console.error('Object compression failed:', error);
        return '';
    }
}
/**
 * Decompresses a string back into an object/array.
 * @deprecated For storage only. Do not use for network transport.
 */
function decompressObject(compressedData) {
    try {
        const jsonString = safeDecompress(compressedData);
        if (!jsonString)
            return null;
        return JSON.parse(jsonString);
    }
    catch (error) {
        console.error('Object decompression failed:', error);
        return null;
    }
}
