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

export interface PostOptions {
  text: string;
  /** Optional image URLs or base64 data URIs to embed (max 4) */
  images?: PostImage[];
  /** If set, reply into this thread */
  replyTo?: { rootUri: string; rootCid: string; parentUri: string; parentCid: string };
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

    const rt = new RichText({ text: options.text });
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

    console.log(`[BlueskyPoster] Posted: ${result.uri}`);
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
