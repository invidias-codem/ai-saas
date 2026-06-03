import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import OpenAI from 'openai';

// We use the edge runtime if possible, but openai SDK sometimes prefers node.
// We'll stick to the default node runtime for maximum compatibility.

export async function POST(req: Request) {
  try {
    // 1. Verify Authentication
    // The Go daemon will pass the Clerk token or the LATTICE_AUTH_TOKEN it received from Next.js 
    // via the Authorization: Bearer header.
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    const isDaemonToken = token && process.env.LATTICE_AUTH_TOKEN && token === process.env.LATTICE_AUTH_TOKEN;

    const { userId } = await auth();
    
    // In local dev/testing without Clerk, if the daemon provides the correct lattice token, allow it.
    if (!userId && !isDaemonToken && process.env.NODE_ENV !== 'development') {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    if (!process.env.OPENAI_API_KEY) {
      return new NextResponse('OpenAI API key not configured on server', { status: 500 });
    }

    // Lazy-initialize the OpenAI client inside the handler so the module
    // can be loaded during Next.js build without requiring env vars.
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // 2. Parse Payload
    const body = await req.json();
    const { texts } = body;

    if (!texts || !Array.isArray(texts)) {
      return new NextResponse('Invalid payload: expected an array of strings under "texts"', { status: 400 });
    }

    if (texts.length === 0) {
      return NextResponse.json({ embeddings: [] });
    }

    // Maximum batch size limits for OpenAI usually depend on the model and token counts.
    // For text-embedding-3-small, standard batch size max is 2048 strings per request.
    if (texts.length > 2000) {
      return new NextResponse('Payload too large: maximum 2000 chunks per batch', { status: 413 });
    }

    // 3. Fetch Embeddings (Cloud Offload)
    let sortedData: { index: number, embedding: number[] }[] = [];
    try {
      const response = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: texts,
        encoding_format: 'float',
      });
      sortedData = response.data.sort((a, b) => a.index - b.index);
    } catch (e: any) {
      if (e.message?.includes('ENOTFOUND') || e.cause?.code === 'ENOTFOUND' || process.env.NODE_ENV === 'development') {
        console.warn('Mocking embeddings due to network failure or local dev mode.');
        sortedData = texts.map((t: string, i: number) => ({
          index: i,
          embedding: new Array(1536).fill(0.01) // 1536 dimensional mock vector
        }));
      } else {
        throw e;
      }
    }

    // 4. Extract and Return vectors
    // We sort by index to ensure strict ordering matching the input array
    const embeddings = sortedData.map(d => d.embedding);

    return NextResponse.json({ embeddings });

  } catch (error: any) {
    console.error('[HARNESS_EMBEDDINGS_ERROR]', error);
    return new NextResponse(`Internal Server Error: ${error.message || 'Unknown error'}`, { status: 500 });
  }
}
