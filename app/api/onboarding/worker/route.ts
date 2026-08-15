import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabaseClient';
import { waitUntil } from '@vercel/functions';
import { prepareSourceChunks } from '@/lib/ai/sourceIngest';
import { generateEmbedding } from '@/lib/memory/embedding';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import * as cheerio from 'cheerio';

type IngestStatus = {
  stage: 'ingest:start' | 'scrape:fetch' | 'gemini:cleanse' | 'vector:upsert' | 'persona:synth' | 'ingest:complete';
  workspaceId: string;
  totalUrls: number;
  successfulScrapes: number;
  failedUrl?: string;
  error?: string;
  durationMs?: number;
};

const log = (event: IngestStatus) => {
  console.log('[OnboardingWorker]', JSON.stringify(event));
};

async function fetchAndExtractText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; DataRefinery/1.0; +https://example.com/bot)',
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/pdf')) {
    return `[PDF detected] ${url}`;
  }
  const html = await res.text();
  const $ = cheerio.load(html);
  const title = $('title').text().trim() || '';
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim() || '';
  return `TITLE: ${title}\nURL: ${url}\n\n${bodyText.slice(0, 12000)}`;
}

async function scrapeAndChunk(url: string): Promise<any[]> {
  const raw = await fetchAndExtractText(url);
  const doc = {
    source_type: 'url' as const,
    title: new URL(url).hostname,
    origin_uri: url,
    raw_text: raw,
    metadata: { via: 'onboarding', needs_scrape: true },
    cleanse: true,
  };
  const chunks = await prepareSourceChunks(doc, { googleApiKey: process.env.GOOGLE_API_KEY });
  return chunks;
}

async function synthesizePersona(workspaceId: string, intentText: string) {
  if (!supabaseAdmin) return null;
  const prompt = `You are a senior AI prompt engineer. Produce a concise .sudo.md style persona spec for a domain-specific consultant.

Workspace domain intent:
${intentText}

Output rules:
- Use frontmatter with name, mode, style.
- Define strict persona constraints, tone, objective, and forbidden behaviors.
- Include a "Knowledge Constraints" section referencing seeded sources.
- Keep it under 4000 characters.`;

  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || '');
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
  });
  const text = result.response?.text()?.trim() || '';
  if (!text) return null;
  const payload = {
    workspace_id: workspaceId,
    name: `${workspaceId} persona`,
    content: text,
    model: 'gemini-2.5-flash',
  };
  const { error } = await supabaseAdmin.from('workspace_personas').insert(payload);
  if (error) console.error('[OnboardingWorker] persona insert error:', error);
  return text;
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { workspaceId, domainIntent, urls, notes } = body || {};
    if (!workspaceId || !domainIntent) {
      return NextResponse.json({ error: 'Missing workspaceId or domainIntent' }, { status: 400 });
    }

    if (!supabaseAdmin) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });

    const resolved = await supabaseAdmin
      .from('workspaces')
      .select('id,user_id')
      .eq('id', workspaceId)
      .eq('user_id', userId)
      .maybeSingle();
    if (resolved.error) throw resolved.error;
    if (!resolved.data) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const allUrlSources = Array.isArray(urls) ? urls.filter(Boolean) : [];
    const allNotes = Array.isArray(notes) ? notes.filter(Boolean) : [];

    waitUntil(
      (async () => {
        const t0 = Date.now();
        const status: IngestStatus = {
          stage: 'ingest:start',
          workspaceId,
          totalUrls: allUrlSources.length,
          successfulScrapes: 0,
        };
        log(status);

        try {
          const urlPayloads: any[] = [];
          for (const url of allUrlSources.slice(0, 8)) {
            try {
              log({ ...status, stage: 'scrape:fetch', workspaceId, totalUrls: allUrlSources.length, successfulScrapes: urlPayloads.length });
              const chunks = await scrapeAndChunk(url);
              log({ ...status, stage: 'gemini:cleanse', workspaceId, totalUrls: allUrlSources.length, successfulScrapes: urlPayloads.length });

              const rows = await Promise.all(
                chunks.map(async (c) => ({
                  workspace_id: workspaceId,
                  user_id: userId,
                  source_type: c.source_type,
                  title: c.title,
                  origin_uri: c.origin_uri,
                  raw_text: c.raw_text,
                  content: c.content,
                  embedding: await generateEmbedding(c.content).catch(() => null),
                  metadata: c.metadata,
                }))
              );
              urlPayloads.push(...rows);
              status.successfulScrapes = urlPayloads.length;
            } catch (e: any) {
              log({ ...status, stage: 'ingest:start', workspaceId, totalUrls: allUrlSources.length, successfulScrapes: urlPayloads.length, failedUrl: url, error: e?.message || 'scrape_failed' });
            }
          }

          const notePayloads = allNotes.map((text: string) => ({
            workspace_id: workspaceId,
            user_id: userId,
            source_type: 'note',
            title: text.split('\n')[0].slice(0, 60) || 'Note',
            origin_uri: null,
            raw_text: text,
            content: text,
            embedding: null,
            metadata: { via: 'onboarding' },
          }));

          const domainPayload = {
            workspace_id: workspaceId,
            user_id: userId,
            source_type: 'note',
            title: 'Consultant domain intent',
            origin_uri: null,
            raw_text: `This consultant's domain and purpose: ${domainIntent}`,
            content: `This consultant's domain and purpose: ${domainIntent}`,
            embedding: null,
            metadata: { via: 'onboarding', kind: 'domain_intent' },
          };

          const toInsert = [...notePayloads, domainPayload, ...urlPayloads];
          if (toInsert.length > 0 && supabaseAdmin) {
            log({ ...status, stage: 'vector:upsert', workspaceId, totalUrls: allUrlSources.length, successfulScrapes: status.successfulScrapes });
            await supabaseAdmin.from('workspace_sources').insert(toInsert);
          }

          log({ ...status, stage: 'persona:synth', workspaceId, totalUrls: allUrlSources.length, successfulScrapes: status.successfulScrapes });
          await synthesizePersona(workspaceId, domainIntent);

          const durationMs = Date.now() - t0;
          log({ ...status, stage: 'ingest:complete', workspaceId, totalUrls: allUrlSources.length, successfulScrapes: status.successfulScrapes, durationMs });
        } catch (e: any) {
          log({ ...status, stage: 'ingest:complete', workspaceId, totalUrls: allUrlSources.length, successfulScrapes: status.successfulScrapes, error: e?.message || 'worker_failed' });
        }
      })().catch((e) => console.error('[OnboardingWorker] unhandled background failure:', e))
    );

    return NextResponse.json({ accepted: true });
  } catch (error: any) {
    console.error('[OnboardingWorker] Fatal:', error);
    return NextResponse.json({ error: 'Internal Server Error', details: error?.message }, { status: 500 });
  }
}
