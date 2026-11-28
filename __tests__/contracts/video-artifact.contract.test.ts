import { toVideoPrediction, type VideoJob } from '@/lib/media/videoStore';
import { downloadProviderMp4 } from '@/lib/media/videoArtifact';
import { isUsableMediaUrl } from '@/components/media/types';

jest.mock('@/lib/supabaseClient', () => ({ supabaseAdmin: null }));
jest.mock('@/lib/security/urlValidator', () => ({ validateExternalUrl: jest.fn() }));
const { validateExternalUrl } = jest.requireMock('@/lib/security/urlValidator');

const job = (overrides: Partial<VideoJob> = {}): VideoJob => ({
  id: 'e482eb32-349e-4174-a639-80a2dbdfcc8a', user_id: 'user_owner',
  prediction_id: 'prediction1', status: 'processing', object_path: null,
  byte_size: null, error_message: null, created_at: new Date().toISOString(),
  ...overrides,
});

describe('Durable video completion contract', () => {
  test('provider success is withheld until the MP4 is stored', () => {
    expect(toVideoPrediction(job({ status: 'persisting' }))).toEqual({
      id: 'prediction1', status: 'processing', output: undefined,
      downloadUrl: undefined, error: undefined,
    });
  });
  test('saved output uses stable application URLs, with no provider credentials or URL', () => {
    const result = toVideoPrediction(job({ status: 'succeeded', object_path: 'videos/job.mp4', byte_size: 24 }));
    expect(result.output).toBe('/api/video/artifacts/e482eb32-349e-4174-a639-80a2dbdfcc8a/preview');
    expect(result.downloadUrl).toBe('/api/video/artifacts/e482eb32-349e-4174-a639-80a2dbdfcc8a/download');
    expect(isUsableMediaUrl(result.output)).toBe(true);
    expect(isUsableMediaUrl('//evil.example/file.mp4')).toBe(false);
    expect(isUsableMediaUrl('/api/unrelated')).toBe(false);
  });
});

describe('Provider MP4 acquisition boundary', () => {
  const mp4 = Buffer.from('000000186674797069736f6d0000000069736f6d6d703432', 'hex');
  beforeEach(() => validateExternalUrl.mockResolvedValue({ valid: true }));
  test('fetches only DNS-validated Replicate delivery URLs and refuses redirects', async () => {
    const fetcher = jest.fn().mockResolvedValue(new Response(mp4, { headers: { 'content-type': 'video/mp4' } }));
    expect(await downloadProviderMp4('https://sub.replicate.delivery/video.mp4', fetcher)).toEqual(mp4);
    expect(fetcher.mock.calls[0][1].redirect).toBe('error');
    expect(validateExternalUrl).toHaveBeenCalled();
  });
  test.each(['http://replicate.delivery/x', 'https://replicate.delivery.evil.com/x', 'https://localhost/x', 'https://replicate.delivery:8443/x'])('refuses untrusted output %s before fetching', async (url) => {
    const fetcher = jest.fn();
    await expect(downloadProviderMp4(url, fetcher)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  test('private DNS results are refused', async () => {
    validateExternalUrl.mockResolvedValue({ valid: false });
    const fetcher = jest.fn();
    await expect(downloadProviderMp4('https://replicate.delivery/x', fetcher)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  test('rejects HTML/error bodies disguised as MP4', async () => {
    await expect(downloadProviderMp4('https://replicate.delivery/x', jest.fn().mockResolvedValue(
      new Response('<html>expired</html>', { headers: { 'content-type': 'video/mp4' } }),
    ))).rejects.toThrow('MP4');
  });
  test('enforces the body limit without trusting Content-Length', async () => {
    await expect(downloadProviderMp4('https://replicate.delivery/x', jest.fn().mockResolvedValue(
      new Response(mp4, { headers: { 'content-type': 'video/mp4' } }),
    ), 12)).rejects.toThrow('size');
  });
});
