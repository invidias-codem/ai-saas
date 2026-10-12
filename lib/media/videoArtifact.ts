import { validateExternalUrl } from '@/lib/security/urlValidator';
import {
  VIDEO_BUCKET, videoDb, claimVideoPersistence, finishVideoPersistence,
  releaseVideoPersistence, failVideoJob, type VideoJob,
} from './videoStore';
import { videoProvider } from './videoProvider';

export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

export async function downloadProviderMp4(url: string, fetcher: typeof fetch = fetch, maxBytes = MAX_VIDEO_BYTES): Promise<Buffer> {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port ||
      !(parsed.hostname === 'replicate.delivery' || parsed.hostname.endsWith('.replicate.delivery'))) {
    throw new Error('Untrusted video output URL');
  }
  if (!(await validateExternalUrl(url)).valid) throw new Error('Unsafe video output host');
  // Never follow an allowlisted CDN redirect to an unvalidated host.
  const response = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(60_000) });
  if (!response.ok || !response.body) throw new Error('Video output unavailable');
  const type = response.headers.get('content-type')?.split(';')[0].trim();
  if (type !== 'video/mp4' && type !== 'application/octet-stream') {
    await response.body.cancel();
    throw new Error('Video output is not an MP4');
  }
  if (Number(response.headers.get('content-length')) > maxBytes) {
    await response.body.cancel();
    throw new Error('Video exceeds storage size limit');
  }
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error('Video exceeds storage size limit');
      chunks.push(Buffer.from(value));
    }
  } finally {
    await reader.cancel();
  }
  const bytes = Buffer.concat(chunks, size);
  // ISO base media file signature, independent of the HTTP MIME header.
  if (bytes.length < 16 || bytes.toString('ascii', 4, 8) !== 'ftyp' ||
      bytes.readUInt32BE(0) < 16 || bytes.readUInt32BE(0) > bytes.length) {
    throw new Error('Video output has no valid MP4 signature');
  }
  return bytes;
}

/** Called only with an owner-scoped durable row. Returns true when terminal. */
export async function advanceVideoJob(job: VideoJob): Promise<boolean> {
  if (['succeeded', 'failed', 'canceled'].includes(job.status)) return true;
  if (!job.prediction_id) throw new Error('Video prediction is not yet recorded');
  let output: unknown;
  if (job.status !== 'persisting') {
    const prediction = await videoProvider().predictions.get(job.prediction_id);
    if (prediction.status === 'failed' || prediction.status === 'canceled') {
      await failVideoJob(job, 'Video generation did not complete. Please try again.', prediction.status);
      return true;
    }
    if (prediction.status !== 'succeeded') return false;
    output = prediction.output;
  }
  const leaseToken = await claimVideoPersistence(job);
  if (!leaseToken) return false;
  try {
    const path = `${job.id}/video.mp4`;
    const bucket = videoDb().storage.from(VIDEO_BUCKET);
    const info = await bucket.info(path);
    // Recover upload-before-commit crashes without touching an expired provider
    // URL. The bucket is private and only this validated uploader can write it.
    if (info.data) {
      if (info.data.contentType !== 'video/mp4' || !info.data.size || info.data.size > MAX_VIDEO_BYTES) {
        throw new Error('Invalid stored video metadata');
      }
      await finishVideoPersistence(job, leaseToken, path, info.data.size);
      return false;
    }
    if (!['404', '400'].includes(String((info.error as { statusCode?: string })?.statusCode))) {
      throw info.error ?? new Error('Unable to read video storage metadata');
    }
    if (output === undefined) output = (await videoProvider().predictions.get(job.prediction_id)).output;
    const url = typeof output === 'string' ? output
      : Array.isArray(output) && output.length === 1 && typeof output[0] === 'string' ? output[0] : null;
    if (!url) throw new Error('Generation completed without a usable video file');
    const bytes = await downloadProviderMp4(url);
    const { error } = await bucket.upload(path, bytes, {
      contentType: 'video/mp4', upsert: false,
    });
    // A crash after upload but before commit leaves this immutable object.
    // Retrying the same job accepts that object; it never overwrites it.
    if (error) {
      if (String((error as { statusCode?: string }).statusCode) !== '409') throw error;
      const existing = await bucket.info(path);
      if (existing.error || !existing.data.size || existing.data.contentType !== 'video/mp4' || existing.data.size > MAX_VIDEO_BYTES) {
        throw new Error('Unable to verify stored video after retry');
      }
      await finishVideoPersistence(job, leaseToken, path, existing.data.size);
      return false;
    }
    await finishVideoPersistence(job, leaseToken, path, bytes.byteLength);
    return false; // Re-read durable state before deciding terminal success.
  } catch (error) {
    await releaseVideoPersistence(job, leaseToken);
    throw error;
  }
}
