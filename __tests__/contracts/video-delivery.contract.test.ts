import { GET, HEAD } from '@/app/api/video/artifacts/[id]/[mode]/route';
import { GET as statusGET } from '@/app/api/video/predictions/[id]/route';

jest.mock('@clerk/nextjs/server', () => ({ auth: jest.fn() }));
jest.mock('@/lib/env', () => ({ env: { NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co' } }));
jest.mock('@/lib/media/videoReadAuth', () => ({ limitVideoRead: jest.fn() }));
jest.mock('@/lib/security/urlValidator', () => ({ validateExternalUrl: jest.fn() }));
jest.mock('@/lib/media/videoDispatch', () => ({ dispatchVideoCompletion: jest.fn() }));
jest.mock('@/lib/media/videoStore', () => ({
  ...jest.requireActual('@/lib/media/videoStore'),
  getOwnedVideoJob: jest.fn(), videoDb: jest.fn(),
}));
jest.mock('@/lib/supabaseClient', () => ({ supabaseAdmin: null }));
const { auth } = jest.requireMock('@clerk/nextjs/server');
const { getOwnedVideoJob, videoDb } = jest.requireMock('@/lib/media/videoStore');
const { limitVideoRead } = jest.requireMock('@/lib/media/videoReadAuth');
const { validateExternalUrl } = jest.requireMock('@/lib/security/urlValidator');
const { dispatchVideoCompletion } = jest.requireMock('@/lib/media/videoDispatch');

const id = 'e482eb32-349e-4174-a639-80a2dbdfcc8a';
const context = (mode = 'preview') => ({ params: Promise.resolve({ id, mode }) });
const signedUrl = `https://example.supabase.co/storage/v1/object/sign/video-artifacts/${id}/video.mp4?token=private`;

describe('Authenticated video preview/download delivery', () => {
  let fetcher: jest.SpyInstance;
  let sign: jest.Mock;
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue({ userId: 'user_owner' });
    limitVideoRead.mockResolvedValue(null);
    validateExternalUrl.mockResolvedValue({ valid: true });
    getOwnedVideoJob.mockResolvedValue({ id, user_id: 'user_owner', prediction_id: 'pred1',
      status: 'succeeded', object_path: `${id}/video.mp4`, byte_size: 100 });
    sign = jest.fn().mockResolvedValue({ data: { signedUrl }, error: null });
    videoDb.mockReturnValue({ storage: { from: jest.fn().mockReturnValue({ createSignedUrl: sign }) } });
    fetcher = jest.spyOn(global, 'fetch').mockResolvedValue(new Response('mp4', {
      headers: { 'content-length': '3' },
    }));
  });
  afterEach(() => fetcher.mockRestore());

  test('unauthenticated users cannot reach storage', async () => {
    auth.mockResolvedValue({ userId: null });
    expect((await GET(new Request('https://app.test/video'), context())).status).toBe(401);
    expect(getOwnedVideoJob).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });
  test('other owners receive 404 before any URL is signed or fetched', async () => {
    getOwnedVideoJob.mockResolvedValue(null);
    expect((await GET(new Request('https://app.test/video'), context())).status).toBe(404);
    expect(getOwnedVideoJob).toHaveBeenCalledWith('user_owner', id, 'id');
    expect(sign).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });
  test('Safari byte ranges stream 206 bytes and Content-Range without exposing signed URLs', async () => {
    fetcher.mockResolvedValue(new Response('mp', { status: 206, headers: {
      'content-range': 'bytes 0-1/100', 'content-length': '2',
    } }));
    const response = await GET(new Request('https://app.test/video', { headers: { Range: 'bytes=0-1' } }), context());
    expect(response.status).toBe(206);
    expect(await response.text()).toBe('mp');
    expect(response.headers.get('content-range')).toBe('bytes 0-1/100');
    expect(response.headers.get('accept-ranges')).toBe('bytes');
    expect(response.headers.get('content-disposition')).toContain('inline');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(fetcher.mock.calls[0][1].headers.get('range')).toBe('bytes=0-1');
    expect(response.headers.get('location')).toBeNull();
  });
  test('download uses attachment and a safe MP4 filename', async () => {
    const response = await GET(new Request('https://app.test/video'), context('download'));
    expect(response.headers.get('content-disposition')).toBe(`attachment; filename="lattice-video-${id}.mp4"`);
    expect(response.headers.get('content-type')).toBe('video/mp4');
  });
  test('HEAD returns metadata without a response body', async () => {
    const response = await HEAD(new Request('https://app.test/video', { method: 'HEAD' }), context());
    expect(await response.text()).toBe('');
    expect(fetcher.mock.calls[0][1].method).toBe('HEAD');
  });
  test('invalid/multi-range requests return 416 without storage fetch', async () => {
    const response = await GET(new Request('https://app.test/video', { headers: { Range: 'bytes=0-1,4-5' } }), context());
    expect(response.status).toBe(416);
    expect(response.headers.get('content-range')).toBe('bytes */100');
    expect(fetcher).not.toHaveBeenCalled();
  });
  test('unready results do not masquerade as a playable video', async () => {
    getOwnedVideoJob.mockResolvedValue({ status: 'persisting' });
    expect((await GET(new Request('https://app.test/video'), context())).status).toBe(409);
    expect(fetcher).not.toHaveBeenCalled();
  });
  test('rate limits apply before artifact lookup', async () => {
    limitVideoRead.mockResolvedValue(new Response(null, { status: 429 }));
    expect((await GET(new Request('https://app.test/video'), context())).status).toBe(429);
    expect(getOwnedVideoJob).not.toHaveBeenCalled();
  });
  test('status denies unknown and legacy unowned provider IDs', async () => {
    getOwnedVideoJob.mockResolvedValue(null);
    const response = await statusGET(new Request('https://app.test/status'), { params: Promise.resolve({ id: 'foreign' }) });
    expect(response.status).toBe(404);
    expect(getOwnedVideoJob).toHaveBeenCalledWith('user_owner', 'foreign');
    expect(dispatchVideoCompletion).not.toHaveBeenCalled();
  });
  test('completed status is served solely from durable storage metadata', async () => {
    const response = await statusGET(new Request('https://app.test/status'), { params: Promise.resolve({ id: 'pred1' }) });
    expect((await response.json()).output).toBe(`/api/video/artifacts/${id}/preview`);
    expect(dispatchVideoCompletion).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
