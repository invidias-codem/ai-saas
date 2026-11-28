// Compatibility with the published dataset schema of Threads build 0.1.47.
// Synthetic public-row fixtures; no credentials, network, or paid runs.
import { normalizeThreadsEvidence, validateThreadsActorRow } from '@/lib/acquisition/providers/apify/threadsNormalizer';

const deps = {
  providerRunId: 'run-schema', datasetId: 'dataset-schema',
  providerActorId: 'automation-lab/threads-scraper@0.1.47',
  acquisitionRequestId: 'request-schema', retrievedAt: '2026-10-18T12:00:00Z',
  providerRunSucceeded: true,
};

describe('Threads published actor schema compatibility', () => {
  test('nullable profile fields preserve unknown values without rejecting the row', () => {
    const result = validateThreadsActorRow({
      type: 'profile', username: 'example', userId: 'user-1', fullName: null,
      biography: null, followerCount: null, isVerified: null, profilePicUrl: null,
      url: 'https://www.threads.com/@example', timestamp: null, media: null,
      futureField: { value: null },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    const evidence = normalizeThreadsEvidence(result.row, deps);
    expect(evidence.author?.displayName).toBeUndefined();
    expect(evidence.temporal.publishedAt).toBeUndefined();
    expect(result.row.futureField).toEqual({ value: null });
  });

  test('Unix seconds, photo media, video URLs, and nullable engagement normalize together', () => {
    const result = validateThreadsActorRow({
      type: 'post', postId: 'post-1', code: 'ABC', username: 'example',
      text: 'A public post', timestamp: 1736942400, mediaType: 'photo',
      likeCount: null, replyCount: 0, repostCount: null, quoteCount: null,
      media: [
        { type: 'photo', url: 'https://example.com/photo.jpg', width: 1080 },
        { type: 'video', url: 'https://example.com/poster.jpg', videoUrl: 'https://example.com/video.mp4' },
        { type: null, url: null },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    const evidence = normalizeThreadsEvidence(result.row, deps);
    expect(evidence.temporal.publishedAt).toBe('2025-01-15T12:00:00.000Z');
    expect(evidence.engagement?.likes).toBeUndefined();
    expect(evidence.engagement?.replies).toBe(0);
    expect(evidence.content.media).toEqual([
      { type: 'image', sourceUrl: 'https://example.com/photo.jpg' },
      { type: 'video', sourceUrl: 'https://example.com/video.mp4' },
    ]);
  });

  test('published ISO date is used when the Unix timestamp is unavailable', () => {
    const result = validateThreadsActorRow({ type: 'post', postId: 'post-2', timestamp: null, date: '2025-01-15T12:00:00.000Z' });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(normalizeThreadsEvidence(result.row, deps).temporal.publishedAt).toBe('2025-01-15T12:00:00.000Z');
  });

  test.each([NaN, Infinity, -1, 1e30])('rejects invalid numeric timestamps %s', timestamp => {
    expect(validateThreadsActorRow({ type: 'post', postId: 'post-3', timestamp }).ok).toBe(false);
  });

  test('null identity still refuses instead of inventing a resource', () => {
    expect(validateThreadsActorRow({ type: 'post', postId: null, code: null, userId: null, username: null }).ok).toBe(false);
  });
});
