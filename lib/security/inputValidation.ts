// lib/security/inputValidation.ts
import { z } from 'zod';

/**
 * Common validation schemas
 */

// UUID validation
export const uuidSchema = z.string().uuid('Invalid ID format');

// Pagination schemas
export const paginationSchema = z.object({
    page: z.number().int().min(1).max(1000).optional().default(1),
    limit: z.number().int().min(1).max(100).optional().default(20),
});

// Common string constraints
export const nonEmptyString = z.string().min(1, 'Field cannot be empty');
export const shortString = z.string().min(1).max(100);
export const mediumString = z.string().min(1).max(500);
export const longString = z.string().min(1).max(10000);

// Shared attachment schema
export const fileUploadSchema = z.object({
    base64Data: z.string().min(1).optional(),
    fileUri: z.string().max(1024).optional(),
    type: z.string().regex(/^[a-z]+\/[a-z0-9\-\+\.]+$/i, 'Invalid MIME type'),
    mimeType: z.string().regex(/^[a-z]+\/[a-z0-9\-\+\.]+$/i, 'Invalid MIME type').optional(),
    name: z.string().min(1).max(255).optional(),
    sizeBytes: z.number().int().positive().optional(),
    storageProvider: z.enum(['gcs']).optional(),
}).refine(
    value => Boolean(value.base64Data || value.fileUri),
    'Either base64Data or fileUri is required'
);

// Message/prompt schemas
export const promptSchema = z.string().min(1).max(50000); // 50k character limit
export const messageSchema = z.object({
    role: z.enum(['user', 'assistant', 'bot', 'system']),
    text: z.string().min(1),
    fileData: fileUploadSchema.optional(),
});

// Conversation schemas
export const conversationIdSchema = uuidSchema;
export const messageIdSchema = uuidSchema;

// Memory operation schemas
export const memoryTypeSchema = z.enum(['fact', 'preference', 'event', 'context']);
export const featureTypeSchema = z.enum(['conversation', 'code', 'image', 'video', 'music']);

// Image generation schemas
export const aspectRatioSchema = z.enum([
    "1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"
]);

export const imageGenerationSchema = z.object({
    prompt: z.string().min(1).max(5000),
    amount: z.string().transform(s => parseInt(s, 10)).pipe(z.number().min(1).max(4)),
    resolution: aspectRatioSchema,
    model: z.enum(['flux-schnell', 'sdxl', 'playground-v2.5']).optional(),
});

// Video/Music generation schemas
export const videoGenerationSchema = z.object({
    prompt: z.string().min(1).max(5000),
    duration: z.number().min(1).max(60).optional(),
});

export const musicGenerationSchema = z.object({
    prompt: z.string().min(1).max(1000),
    duration: z.number().min(5).max(300).optional(),
});

// Query parameter schemas
export const booleanQueryParam = z
    .string()
    .optional()
    .transform(val => val === 'true');

export const numberQueryParam = z
    .string()
    .optional()
    .transform(val => val ? parseInt(val, 10) : undefined);

/**
 * Validation error response
 */
export class ValidationError extends Error {
    constructor(
        message: string = 'Validation failed',
        public details?: Record<string, string[]>
    ) {
        super(message);
        this.name = 'ValidationError';
    }
}

/**
 * Sanitize string input (remove potentially dangerous characters)
 * Note: This is NOT a replacement for proper parameterization!
 */
export function sanitizeString(input: string): string {
    return input
        .replace(/[<>]/g, '') // Remove HTML tags
        .replace(/[;&|`$()]/g, '') // Remove shell injection chars
        .trim();
}

/**
 * Validate and parse request body against schema
 * Throws ValidationError on failure
 */
export function validateRequestBody<T>(
    body: unknown,
    schema: z.ZodSchema<T>
): T {
    const result = schema.safeParse(body);

    if (!result.success) {
        throw new ValidationError(
            'Invalid request body',
            result.error.flatten().fieldErrors as Record<string, string[]>
        );
    }

    return result.data;
}

/**
 * Validate request size (prevent DoS via large payloads)
 */
export function validateRequestSize(
    body: unknown,
    maxSizeBytes: number = 10 * 1024 * 1024 // 10MB default
): void {
    const size = JSON.stringify(body).length;

    if (size > maxSizeBytes) {
        throw new ValidationError(
            `Request body too large: ${(size / 1024 / 1024).toFixed(2)}MB (max: ${(maxSizeBytes / 1024 / 1024).toFixed(2)}MB)`
        );
    }
}

/**
 * Validate array length
 */
export function validateArrayLength<T>(
    array: T[],
    maxLength: number,
    fieldName: string = 'Array'
): void {
    if (array.length > maxLength) {
        throw new ValidationError(
            `${fieldName} exceeds maximum length of ${maxLength}`
        );
    }
}

/**
 * Safe integer parsing with validation
 */
export function parseIntSafe(
    value: string | number | undefined,
    min?: number,
    max?: number
): number | undefined {
    if (value === undefined || value === '') return undefined;

    const num = typeof value === 'string' ? parseInt(value, 10) : value;

    if (isNaN(num)) {
        throw new ValidationError('Invalid number format');
    }

    if (min !== undefined && num < min) {
        throw new ValidationError(`Number must be at least ${min}`);
    }

    if (max !== undefined && num > max) {
        throw new ValidationError(`Number must be at most ${max}`);
    }

    return num;
}
