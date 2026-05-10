/**
 * lib/agents/bluesky/BlueskyPoster.ts
 *
 * Proactive posting agent for Bluesky.
 * Creates original posts, supports image embeds, and handles thread-style posts.
 *
 * Used by: /api/cron/bluesky-post (scheduled) and /api/bluesky/post (manual)
 */

import { BskyAgent, RichText } from '@atproto/api';
import type { AppBskyEmbedImages } from '@atproto/api';

const RESPONSE_MAX_CHARS = 290;
const SITE_CTA = 'gen1e.xyz';
const DONATION_URL = process.env.BLUESKY_DONATION_URL || process.env.KOFI_URL || '';
const TOPIC_KEYWORDS = {
  ai: ['ai', 'llm', 'llms', 'model', 'models', 'agent', 'agents', 'inference', 'reasoning'],
  memory: ['memory', 'memory-native', 'context', 'knowledge graph', 'graph', 'rag'],
  tech: ['tech', 'developer', 'devtools', 'startup', 'saas', 'infra', 'infrastructure', 'tooling', 'news'],
};

export interface PostOptions {
  text: string;
  /** Optional image URLs or base64 data URIs to embed (max 4) */
  images?: PostImage[];
  /** If set, reply into this thread */
  replyTo?: { rootUri: string; rootCid: string; parentUri: string; parentCid: string };
  /** Optional explicit topic labels to bias CTA behavior */
  topics?: string[];
  /** Force a specific CTA strategy when needed */
  ctaMode?: 'auto' | 'site' | 'donation' | 'none';
}

export interface PostImage {
  /** Public URL or base64 data URI of the image */
  url: string;
  /** Alt text for accessibility */
  alt: string;
  /** MIME type — defaults to image/jpeg */
  mimeType?: string;
}

export interface PostResult {
  uri: string;
  cid: string;
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function stripEmDashes(text: string): string {
  return text.replace(/[—–]/g, '-');
}

function inferTopicLabels(text: string): string[] {
  const lower = text.toLowerCase();
  const labels = new Set<string>();

  for (const [label, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    if (keywords.some((keyword) => lower.includes(keyword))) {
      labels.add(label);
    }
  }

  return Array.from(labels);
}

function shouldIncludeSiteCta(text: string, topics?: string[]): boolean {
  const lower = text.toLowerCase();
  const labels = new Set([...(topics ?? []), ...inferTopicLabels(text)]);
  const explicitlyProductRelated =
    lower.includes('gen1e') ||
    lower.includes('tech genie') ||
    lower.includes('product') ||
    lower.includes('app') ||
    lower.includes('tool') ||
    lower.includes('platform');

  const explicitlyInvitesLink =
    lower.includes('link in bio') ||
    lower.includes('link below') ||
    lower.includes('try it') ||
    lower.includes('learn more') ||
    lower.includes('see more');

  return explicitlyProductRelated && explicitlyInvitesLink && (labels.has('ai') || labels.has('memory'));
}

function shouldIncludeDonationCta(text: string, topics?: string[]): boolean {
  if (!DONATION_URL) return false;
  const lower = text.toLowerCase();
  const labels = new Set([...(topics ?? []), ...inferTopicLabels(text)]);
  return labels.has('ai') && (
    lower.includes('support') ||
    lower.includes('support this') ||
    lower.includes('donate') ||
    lower.includes('donation') ||
    lower.includes('back this') ||
    lower.includes('help keep this going') ||
    lower.includes('kofi') ||
    lower.includes('ko-fi')
  );
}

function finalizePostText(options: PostOptions): string {
  const mode = options.ctaMode ?? 'auto';
  const topics = options.topics ?? inferTopicLabels(options.text);
  let text = normalizeWhitespace(stripEmDashes(options.text));

  const wantsDonation = mode === 'donation' || (mode === 'auto' && shouldIncludeDonationCta(text, topics));
  const wantsSite = mode === 'site' || (mode === 'auto' && shouldIncludeSiteCta(text, topics));

  if (mode !== 'none' && wantsDonation && DONATION_URL && !text.includes(DONATION_URL)) {
    const donationCta = ` Support the work: ${DONATION_URL}`;
    if (text.length + donationCta.length + 1 <= RESPONSE_MAX_CHARS) {
      text = `${text} ${donationCta}`.trim();
    }
  } else if (mode !== 'none' && wantsSite && !text.includes(SITE_CTA)) {
    const siteCta = ` ${SITE_CTA}`;
    if (text.length + siteCta.length <= RESPONSE_MAX_CHARS) {
      text = `${text}${siteCta}`.trim();
    }
  }

  if (text.length <= RESPONSE_MAX_CHARS) return text;
  return `${text.slice(0, RESPONSE_MAX_CHARS - 3).trim()}...`;
}

export class BlueskyPoster {
  private agent: BskyAgent;
  private authenticated = false;

  constructor() {
    if (!process.env.BLUESKY_HANDLE || !process.env.BLUESKY_APP_PASSWORD) {
      throw new Error('[BlueskyPoster] Missing BLUESKY_HANDLE or BLUESKY_APP_PASSWORD');
    }
    this.agent = new BskyAgent({ service: 'https://bsky.social' });
  }

  private async ensureAuth(): Promise<void> {
    if (this.authenticated) return;
    await this.agent.login({
      identifier: process.env.BLUESKY_HANDLE!,
      password: process.env.BLUESKY_APP_PASSWORD!,
    });
    this.authenticated = true;
  }

  /**
   * Upload an image from a URL or base64 data URI and return the blob ref.
   */
  private async uploadImage(image: PostImage): Promise<AppBskyEmbedImages.Image> {
    let buffer: Buffer;
    let mimeType = image.mimeType ?? 'image/jpeg';

    if (image.url.startsWith('data:')) {
      // Base64 data URI: data:<mimeType>;base64,<data>
      const matches = image.url.match(/^data:([^;]+);base64,(.+)$/);
      if (!matches) throw new Error('[BlueskyPoster] Invalid data URI format');
      mimeType = matches[1];
      buffer = Buffer.from(matches[2], 'base64');
    } else {
      // Fetch from URL
      const res = await fetch(image.url);
      if (!res.ok) throw new Error(`[BlueskyPoster] Failed to fetch image: ${res.status} ${image.url}`);
      const contentType = res.headers.get('content-type');
      if (contentType) mimeType = contentType.split(';')[0].trim();
      buffer = Buffer.from(await res.arrayBuffer());
    }

    const uploadResult = await this.agent.uploadBlob(buffer, { encoding: mimeType });
    return {
      image: uploadResult.data.blob,
      alt: image.alt,
      aspectRatio: undefined,
    };
  }

  /**
   * Create a post with optional images and optional reply threading.
   */
  async post(options: PostOptions): Promise<PostResult> {
    await this.ensureAuth();

    const finalText = finalizePostText(options);
    const rt = new RichText({ text: finalText });
    await rt.detectFacets(this.agent);

    // Build embed if images provided
    let embed: AppBskyEmbedImages.Main | undefined;
    if (options.images && options.images.length > 0) {
      const images = await Promise.all(
        options.images.slice(0, 4).map((img) => this.uploadImage(img))
      );
      embed = {
        $type: 'app.bsky.embed.images',
        images,
      };
    }

    // Build reply ref if replying into a thread
    const replyRef = options.replyTo
      ? {
          root: { uri: options.replyTo.rootUri, cid: options.replyTo.rootCid },
          parent: { uri: options.replyTo.parentUri, cid: options.replyTo.parentCid },
        }
      : undefined;

    const result = await this.agent.post({
      text: rt.text,
      facets: rt.facets,
      embed,
      reply: replyRef,
      createdAt: new Date().toISOString(),
    });

    console.log(`[BlueskyPoster] Posted: ${result.uri} topics=${(options.topics ?? inferTopicLabels(finalText)).join(',') || 'none'} ctaMode=${options.ctaMode ?? 'auto'}`);
    return { uri: result.uri, cid: result.cid };
  }

  /**
   * Post a thread (sequential posts where each replies to the previous).
   * Returns array of post results in order.
   */
  async postThread(posts: Omit<PostOptions, 'replyTo'>[]): Promise<PostResult[]> {
    await this.ensureAuth();
    const results: PostResult[] = [];

    for (let i = 0; i < posts.length; i++) {
      const options: PostOptions = { ...posts[i] };

      if (i > 0 && results.length > 0) {
        const root = results[0];
        const parent = results[i - 1];
        options.replyTo = {
          rootUri: root.uri,
          rootCid: root.cid,
          parentUri: parent.uri,
          parentCid: parent.cid,
        };
      }

      const result = await this.post(options);
      results.push(result);

      // Small delay between thread posts to avoid AT Protocol rate limits
      if (i < posts.length - 1) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    return results;
  }
}
