// app/api/export/route.ts
// Export Genie conversation data in portable formats (GUIF, UDIF-draft, OpenAI)
// This is the outbound side of the UCOL data sovereignty model.

import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { exportToGUIF, exportToUDIFDraft, exportToOpenAIFormat } from '@/lib/import/exporters';
import type { GenieExportOptions, GenieConversation } from '@/lib/types/imports';
import { audit } from '@/lib/security/auditLog';

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return new NextResponse('Unauthorized', { status: 401 });

    const body = await req.json();
    const options: GenieExportOptions = body.options || { format: 'guif' };
    const conversations: GenieConversation[] = body.conversations || [];

    if (!conversations.length) {
      return NextResponse.json({ error: 'No conversations provided' }, { status: 400 });
    }

    // Audit all data exports — high sensitivity operation
    void audit('export.request', userId, {
      format: options.format,
      conversationCount: conversations.length,
      includeMemories: options.includeMemories,
    }, req);

    let exportedData: object;
    let filename: string;
    let contentType = 'application/json';

    switch (options.format) {
      case 'openai':
        exportedData = exportToOpenAIFormat(conversations);
        filename = 'genie-export-openai-compatible.json';
        break;

      case 'udif-draft':
        exportedData = exportToUDIFDraft(conversations, userId, options);
        filename = 'genie-export-udif-draft.json';
        break;

      case 'guif':
      default:
        exportedData = exportToGUIF(conversations, options);
        filename = 'genie-export.json';
        break;
    }

    return NextResponse.json({
      success: true,
      format: options.format,
      filename,
      data: exportedData,
      meta: {
        conversationCount: conversations.length,
        exportedAt: new Date().toISOString(),
        exportedBy: 'genie-ucol-bridge',
      }
    });

  } catch (error: any) {
    console.error('[EXPORT]', error);
    return new NextResponse('Internal Error', { status: 500 });
  }
}
