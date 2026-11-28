// lib/ai/sourceIngest.ts
// Source-agnostic ingestion for the chameleon consultant's knowledge substrate.
//
// Takes arbitrary user material (notes, pasted text, scraped URL content,
// PDF text, NotebookLM exports), normalizes it into typed source documents,
// chunks it, optionally cleanses it with a fast LLM pass, and produces rows
// ready to embed + upsert into public.workspace_sources.
//
// Design notes:
//   * Cleansing is OPTIONAL and off by default for fidelity — raw notes are
//     usually already clean. Turn it on for messy scraped HTML/JSON.
//   * We embed the CLEANSED chunk (content) but keep raw_text for provenance.
//   * Chunking is paragraph-aware with a hard token-ish cap so chunks stay
//     inside the embedding model's comfort zone and retrieval stays precise.

import { z } from 'zod';
import { ExtractedEntities } from '@/lib/refinery/nlp';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export const SOURCE_TYPES = [
    'note',
    'paste',
    'url',
    'pdf',
    'notebooklm',
    'github',
    'refinery',
] as const;

export const SourceTypeSchema = z.enum(SOURCE_TYPES);
export type SourceType = z.infer<typeof SourceTypeSchema>;

export const SourceDocumentSchema = z.object({
    source_type: SourceTypeSchema,
    title: z.string().max(500).optional(),
    origin_uri: z.string().max(2000).optional(),
    raw_text: z.string().min(1, 'Source text is required'),
    // Freeform provenance: author, captured_at, confidence, etc.
    metadata: z.record(z.any()).optional(),
    // If true, run a Gemini-Flash cleanse/structure pass before chunking.
    cleanse: z.boolean().optional(),
});
export type SourceDocument = z.infer<typeof SourceDocumentSchema>;

export interface SourceChunk {
    source_type: SourceType;
    title?: string;
    origin_uri?: string;
    raw_text: string;
    content: string;          // the (possibly cleansed) text that gets embedded
    metadata: Record<string, any>;
}

// Roughly 4 chars/token; keep chunks well under the 8191-token embedding cap
// and small enough for precise retrieval.
const MAX_CHUNK_CHARS = 2400;
const CHUNK_OVERLAP_CHARS = 200;

// ---------------------------------------------------------------------------
// Chunking — paragraph-aware with overlap
// ---------------------------------------------------------------------------

export function chunkText(text: string): string[] {
    const cleaned = text.replace(/\r\n/g, '\n').trim();
    if (cleaned.length <= MAX_CHUNK_CHARS) return cleaned ? [cleaned] : [];

    const paragraphs = cleaned.split(/\n{2,}/);
    const chunks: string[] = [];
    let current = '';

    for (const para of paragraphs) {
        // A single oversized paragraph gets hard-split.
        if (para.length > MAX_CHUNK_CHARS) {
            if (current) { chunks.push(current); current = ''; }
            for (let i = 0; i < para.length; i += MAX_CHUNK_CHARS - CHUNK_OVERLAP_CHARS) {
                chunks.push(para.slice(i, i + MAX_CHUNK_CHARS));
            }
            continue;
        }

        if ((current + '\n\n' + para).trim().length > MAX_CHUNK_CHARS) {
            if (current) chunks.push(current);
            // Seed next chunk with a small overlap tail for continuity.
            const tail = current.slice(-CHUNK_OVERLAP_CHARS);
            current = (tail + '\n\n' + para).trim();
        } else {
            current = current ? `${current}\n\n${para}` : para;
        }
    }
    if (current) chunks.push(current);
    return chunks.filter(c => c.trim().length > 0);
}

// ---------------------------------------------------------------------------
// Optional cleanse pass (Gemini Flash) — for messy scraped/unstructured text
// ---------------------------------------------------------------------------

const CLEANSE_PROMPT = `You are a data structuring engine. Given raw, messy text scraped from the internet or exported from another tool, extract the clean, factual content.

Rules:
- Remove navigation, boilerplate, ads, cookie notices, and formatting noise.
- Preserve ALL factual claims, numbers, prices, dates, names, and specifications verbatim.
- Output clean plain text (light markdown allowed for structure).
- Do NOT summarize away specifics. Do NOT invent facts.
- If the text is already clean notes, return it essentially unchanged.`;

export async function cleanseSourceText(
  raw: string,
  googleApiKey: string,
  anchors?: ExtractedEntities,
): Promise<string> {
    const systemPrompt = anchors
      ? `You are a strict data refinery assistant. Clean and format the following scraped HTML/text into clean Markdown. Strip navigation, footers, and ads.\n\nCRITICAL CONSTRAINTS:\nYou must strictly preserve the following deterministic entities extracted from the source. Do not alter, omit, or hallucinate these values:\n${JSON.stringify(anchors, null, 2)}`
      : CLEANSE_PROMPT;

    // Lazy-import so this module stays loadable in environments without the SDK.
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(googleApiKey);
    const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        systemInstruction: { role: 'user', parts: [{ text: systemPrompt }] },
    });

    const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: raw.slice(0, 30000) }] }],
        generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 8192,
        },
    });

    const text = result.response?.text()?.trim();
    return text && text.length > 0 ? text : raw;
}

// ---------------------------------------------------------------------------
// Main entry: normalize a source document into embeddable chunks
// ---------------------------------------------------------------------------

export async function prepareSourceChunks(
    doc: SourceDocument,
    opts: { googleApiKey?: string } = {}
): Promise<SourceChunk[]> {
    const parsed = SourceDocumentSchema.parse(doc);

    let workingText = parsed.raw_text;
    let cleansed = false;

    if (parsed.cleanse && opts.googleApiKey) {
        try {
            workingText = await cleanseSourceText(parsed.raw_text, opts.googleApiKey);
            cleansed = true;
        } catch {
            // Cleanse is best-effort; fall back to raw text on failure.
            workingText = parsed.raw_text;
        }
    }

    const chunks = chunkText(workingText);
    const total = chunks.length;

    return chunks.map((content, i) => ({
        source_type: parsed.source_type,
        title: parsed.title,
        origin_uri: parsed.origin_uri,
        raw_text: parsed.raw_text,
        content,
        metadata: {
            ...(parsed.metadata || {}),
            chunk_index: i,
            chunk_count: total,
            cleansed,
        },
    }));
}
