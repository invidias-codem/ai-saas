import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getStorageClient, getStorageProjectId, GCPConfigurationError } from '../../../../lib/gcp/storage';
import { v4 as uuidv4 } from 'uuid';

/**
 * Robustly sanitizes a user-provided filename to mitigate path traversal,
 * control character injection, and url-breaking characters.
 */
function sanitizeFilename(filename: string): string {
    // 1. Strip any directory path parts to prevent traversal (e.g. ../, ..\)
    let cleaned = filename.replace(/^.*[\\\/]/, '');

    // 2. Keep only safe alphanumeric, dots, dashes, underscores, and single spaces
    cleaned = cleaned.replace(/[^a-zA-Z0-9.\-_ ]/g, '');

    // 3. Trim whitespace and replace intermediate spaces with underscores
    cleaned = cleaned.trim().replace(/\s+/g, '_');

    // 4. Safe fallback if sanitization results in an empty or special keyword string
    if (!cleaned || cleaned === '.' || cleaned === '..') {
        cleaned = `file_${uuidv4().slice(0, 8)}`;
    }

    return cleaned;
}

export async function POST(req: Request) {
    try {
        // 1. Auth Check (Server-side session gate)
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // 2. Resolve & Instantiate GCP Storage Client
        let storage;
        let projectId;
        try {
            storage = getStorageClient();
            projectId = getStorageProjectId();
        } catch (configErr) {
            if (configErr instanceof GCPConfigurationError) {
                console.error('[GCP_STORAGE_SIGN_ROUTE] Configuration Error:', configErr.message);
                return NextResponse.json({
                    error: 'Server Configuration Error',
                    message: 'Google Cloud Storage is not properly configured on this server.',
                    details: configErr.message
                }, { status: 500 });
            }
            throw configErr;
        }

        // 3. Validate Inputs
        let body;
        try {
            body = await req.json();
        } catch {
            return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
        }

        const { filename, contentType } = body;
        if (!filename || !contentType) {
            return NextResponse.json({ error: 'Missing filename or contentType' }, { status: 400 });
        }

        // 4. Validate Content Type (Security Boundary)
        const allowedTypes = [
            'image/jpeg', 'image/png', 'image/gif', 'image/webp',
            'application/pdf',
            'text/plain', 'text/csv',
            'application/json',
            'video/mp4', 'video/webm',
            'audio/mpeg', 'audio/wav'
        ];
        if (!allowedTypes.includes(contentType)) {
            return NextResponse.json({ error: 'File type not allowed' }, { status: 400 });
        }

        // 5. Sanitize and construct file path
        const sanitizedFilename = sanitizeFilename(filename);
        const bucketName = `genie-uploads-${projectId}`;
        const fileId = uuidv4();
        
        // Path: userId/fileId/sanitizedFilename (Groups by user, secure isolation)
        const filePath = `${userId}/${fileId}/${sanitizedFilename}`;
        const bucket = storage.bucket(bucketName);
        const file = bucket.file(filePath);

        // 6. Generate Signed URL
        const [url] = await file.getSignedUrl({
            version: 'v4',
            action: 'write',
            expires: Date.now() + 15 * 60 * 1000, // 15 minutes
            contentType,
        });

        // 7. Return Details
        return NextResponse.json({
            uploadUrl: url,
            fileUri: `gs://${bucketName}/${filePath}`,
            fileId,
            filePath
        });

    } catch (error: any) {
        console.error('[GCP_STORAGE_SIGN_ROUTE] Signed URL generation error:', error);
        return NextResponse.json({
            error: 'Internal Server Error',
            message: 'An error occurred during signed URL generation.',
            details: process.env.NODE_ENV !== 'production' ? error.message : undefined
        }, { status: 500 });
    }
}
