import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { Storage } from '@google-cloud/storage';
import { v4 as uuidv4 } from 'uuid';

// Initialize Storage
const projectId = process.env.GCP_PROJECT_ID;
const storage = new Storage({ projectId });

export async function POST(req: Request) {
    try {
        // 1. Auth Check
        const { userId } = auth();
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // 2. Validate Input
        const { filename, contentType } = await req.json();
        if (!filename || !contentType) {
            return NextResponse.json({ error: 'Missing filename or contentType' }, { status: 400 });
        }

        // 2.5 Validate Content Type (Security)
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

        // 3. Define Path
        if (!projectId) {
            console.error("Missing GCP_PROJECT_ID env var");
            return NextResponse.json({ error: 'Server Configuration Error' }, { status: 500 });
        }

        const bucketName = `genie-uploads-${projectId}`;
        const fileId = uuidv4();
        // Path: userId/fileId/filename (Groups by user, secure isolation)
        const filePath = `${userId}/${fileId}/${filename}`;
        const bucket = storage.bucket(bucketName);
        const file = bucket.file(filePath);

        // 4. Generate Signed URL
        const [url] = await file.getSignedUrl({
            version: 'v4',
            action: 'write',
            expires: Date.now() + 15 * 60 * 1000, // 15 minutes
            contentType,
        });

        // 5. Return Details
        return NextResponse.json({
            uploadUrl: url,
            fileUri: `gs://${bucketName}/${filePath}`,
            fileId,
            filePath
        });

    } catch (error) {
        console.error('Signed URL Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
