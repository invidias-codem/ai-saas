import { NextRequest, NextResponse } from 'next/server';
import { validateFile } from '@/lib/file-validation';
import { generatePreview } from '@/lib/preview-generator';

export const runtime = 'nodejs';
export const maxDuration = 30; // 30 seconds max for preview generation

/**
 * POST /api/files/preview
 * 
 * Generates a safe preview for any uploaded file.
 * Validates file type, checks for malicious content, then generates appropriate preview.
 * 
 * Request: multipart/form-data with 'file' field
 * Response: { preview, mimeType, filename, size, metadata }
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Convert to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Validate file safety
    const validation = await validateFile(buffer, file.name);

    if (!validation.safe) {
      return NextResponse.json(
        {
          error: 'File rejected for preview',
          reason: validation.reason,
          mimeType: validation.mimeType,
          filename: file.name,
          size: validation.fileSize,
        },
        { status: 400 }
      );
    }

    // Generate preview
    const preview = await generatePreview(buffer, validation.mimeType!, file.name);

    if (preview.type === 'error') {
      return NextResponse.json(
        {
          error: 'Preview generation failed',
          reason: preview.error,
          mimeType: validation.mimeType,
          filename: file.name,
          size: validation.fileSize,
          fallback: true, // Tell client to try alternative rendering
        },
        { status: 500 }
      );
    }

    // Success response
    return NextResponse.json({
      preview: {
        type: preview.type,
        data: preview.data,
        metadata: preview.metadata,
      },
      mimeType: validation.mimeType,
      filename: file.name,
      size: validation.fileSize,
    });
  } catch (error: any) {
    console.error('[PreviewAPI] Error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error.message,
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/files/preview?url=...
 * 
 * Alternative endpoint for previewing files from a URL (e.g., Supabase storage)
 * Requires authentication in production.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get('url');
  const filename = searchParams.get('filename') || 'file';

  if (!url) {
    return NextResponse.json(
      { error: 'Missing url parameter' },
      { status: 400 }
    );
  }

  try {
    // Fetch file from URL
    const response = await fetch(url, {
      // Add headers if needed for authenticated URLs
      headers: {
        'User-Agent': 'LatticeOS-Preview/1.0',
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch file: ${response.statusText}` },
        { status: response.status }
      );
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    // Validate
    const validation = await validateFile(buffer, filename);

    if (!validation.safe) {
      return NextResponse.json(
        {
          error: 'File rejected for preview',
          reason: validation.reason,
          mimeType: validation.mimeType,
          filename,
          size: validation.fileSize,
        },
        { status: 400 }
      );
    }

    // Generate preview
    const preview = await generatePreview(buffer, validation.mimeType!, filename);

    if (preview.type === 'error') {
      return NextResponse.json(
        {
          error: 'Preview generation failed',
          reason: preview.error,
          fallback: true,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      preview: {
        type: preview.type,
        data: preview.data,
        metadata: preview.metadata,
      },
      mimeType: validation.mimeType,
      filename,
      size: validation.fileSize,
    });
  } catch (error: any) {
    console.error('[PreviewAPI] GET Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}