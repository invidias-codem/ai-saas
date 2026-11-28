import { advanceVideoJob } from '@/lib/media/videoArtifact';
import { createVideoPrediction, VideoCreditInsufficientError } from '@/lib/media/video';
import type { VideoJob } from '@/lib/media/videoStore';

jest.mock('@/lib/env', () => ({ env: { TRIGGER_SECRET_KEY: 'configured' } }));
jest.mock('@/lib/supabaseClient', () => ({ supabaseAdmin: null }));
jest.mock('@/lib/analytics/track', () => ({ trackAIGeneration: jest.fn(), trackCreditsDeducted: jest.fn() }));
jest.mock('@/lib/security/urlValidator', () => ({ validateExternalUrl: jest.fn().mockResolvedValue({ valid: true }) }));
jest.mock('@/lib/media/videoProvider', () => ({ videoProvider: jest.fn() }));
jest.mock('@/lib/media/videoDispatch', () => ({ dispatchVideoCompletion: jest.fn() }));
jest.mock('@/lib/credits', () => ({ spendCreditsAtomic: jest.fn(), refundCredits: jest.fn(), CREDIT_COSTS: { VIDEO_GENERATION: 30 } }));
jest.mock('@/lib/media/videoStore', () => ({
  ...jest.requireActual('@/lib/media/videoStore'),
  videoDb: jest.fn(), claimVideoPersistence: jest.fn(), finishVideoPersistence: jest.fn(),
  releaseVideoPersistence: jest.fn(), failVideoJob: jest.fn(), reserveVideoJob: jest.fn(), attachVideoPrediction: jest.fn(),
}));
const store = jest.requireMock('@/lib/media/videoStore');
const { videoProvider } = jest.requireMock('@/lib/media/videoProvider');
const { spendCreditsAtomic, refundCredits } = jest.requireMock('@/lib/credits');
const { dispatchVideoCompletion } = jest.requireMock('@/lib/media/videoDispatch');
const { env } = jest.requireMock('@/lib/env');
const id = 'e482eb32-349e-4174-a639-80a2dbdfcc8a';
const makeJob = (overrides: Partial<VideoJob> = {}): VideoJob => ({
  id, user_id: 'owner', prediction_id: 'pred1', status: 'processing',
  byte_size: null, object_path: null, error_message: null, created_at: new Date().toISOString(), ...overrides,
});

describe('Video persistence and submission retry boundaries', () => {
  let providerGet: jest.Mock;
  let providerCreate: jest.Mock;
  let bucket: { info: jest.Mock; upload: jest.Mock };
  let fetcher: jest.SpyInstance;
  beforeEach(() => {
    jest.clearAllMocks();
    env.TRIGGER_SECRET_KEY = 'configured';
    providerGet = jest.fn().mockResolvedValue({ status: 'succeeded', output: 'https://replicate.delivery/video.mp4' });
    providerCreate = jest.fn().mockResolvedValue({ id: 'pred1', status: 'starting' });
    videoProvider.mockReturnValue({ predictions: { get: providerGet, create: providerCreate } });
    store.claimVideoPersistence.mockResolvedValue('lease1');
    store.reserveVideoJob.mockResolvedValue({ job: makeJob({ prediction_id: null, status: 'submitting' }), created: true });
    store.attachVideoPrediction.mockResolvedValue(makeJob({ status: 'starting' }));
    spendCreditsAtomic.mockResolvedValue({ success: true, duplicate: false, remaining: 100 });
    bucket = { info: jest.fn().mockResolvedValue({ data: null, error: { statusCode: '404' } }),
      upload: jest.fn().mockResolvedValue({ error: null }) };
    store.videoDb.mockReturnValue({ storage: { from: jest.fn().mockReturnValue(bucket) } });
    const mp4 = Buffer.from('000000186674797069736f6d0000000069736f6d6d703432', 'hex');
    fetcher = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(mp4, { headers: { 'content-type': 'video/mp4' } }));
  });
  afterEach(() => fetcher.mockRestore());

  test('provider success is committed only after validated storage upload', async () => {
    await advanceVideoJob(makeJob());
    expect(bucket.upload).toHaveBeenCalledWith(`${id}/video.mp4`, expect.any(Buffer), { contentType: 'video/mp4', upsert: false });
    expect(store.finishVideoPersistence).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'owner' }), 'lease1', `${id}/video.mp4`, 24);
    expect(bucket.upload.mock.invocationCallOrder[0]).toBeLessThan(store.finishVideoPersistence.mock.invocationCallOrder[0]);
  });
  test('upload-before-commit crash recovers without re-fetching the expired provider output', async () => {
    bucket.info.mockResolvedValue({ data: { size: 24, contentType: 'video/mp4' }, error: null });
    providerGet.mockRejectedValue(new Error('provider expired'));
    await advanceVideoJob(makeJob({ status: 'persisting' }));
    expect(providerGet).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
    expect(bucket.upload).not.toHaveBeenCalled();
    expect(store.finishVideoPersistence).toHaveBeenCalled();
  });
  test('an active competing lease causes no fetch, upload, or completion', async () => {
    store.claimVideoPersistence.mockResolvedValue(null);
    expect(await advanceVideoJob(makeJob({ status: 'persisting' }))).toBe(false);
    expect(providerGet).not.toHaveBeenCalled();
    expect(bucket.upload).not.toHaveBeenCalled();
    expect(store.finishVideoPersistence).not.toHaveBeenCalled();
  });
  test('failed uploads release the lease and never mark the artifact ready', async () => {
    bucket.upload.mockResolvedValue({ error: new Error('storage down') });
    await expect(advanceVideoJob(makeJob())).rejects.toThrow('storage down');
    expect(store.releaseVideoPersistence).toHaveBeenCalledWith(expect.anything(), 'lease1');
    expect(store.finishVideoPersistence).not.toHaveBeenCalled();
  });
  test('completed durable jobs do not call the provider again', async () => {
    expect(await advanceVideoJob(makeJob({ status: 'succeeded' }))).toBe(true);
    expect(providerGet).not.toHaveBeenCalled();
  });
  test('missing worker config fails before debit or submission', async () => {
    env.TRIGGER_SECRET_KEY = undefined;
    await expect(createVideoPrediction({ prompt: 'clip' }, 'owner', 'key')).rejects.toThrow('worker');
    expect(spendCreditsAtomic).not.toHaveBeenCalled();
    expect(providerCreate).not.toHaveBeenCalled();
  });
  test('replayed keys return the original owned job without debit or paid submission', async () => {
    store.reserveVideoJob.mockResolvedValue({ job: makeJob(), created: false });
    expect((await createVideoPrediction({ prompt: 'clip' }, 'owner', 'key')).predictionId).toBe('pred1');
    expect(spendCreditsAtomic).not.toHaveBeenCalled();
    expect(providerCreate).not.toHaveBeenCalled();
  });
  test('insufficient credits do not launch any provider run', async () => {
    spendCreditsAtomic.mockResolvedValue({ success: false, duplicate: false, remaining: 0 });
    await expect(createVideoPrediction({ prompt: 'clip' }, 'owner', 'key')).rejects.toBeInstanceOf(VideoCreditInsufficientError);
    expect(providerCreate).not.toHaveBeenCalled();
  });
  test('accepted submission followed by DB failure never refunds or launches a second run', async () => {
    store.attachVideoPrediction.mockRejectedValue(new Error('DB unavailable'));
    await expect(createVideoPrediction({ prompt: 'clip' }, 'owner', 'key')).rejects.toThrow('DB unavailable');
    expect(providerCreate).toHaveBeenCalledTimes(1);
    expect(refundCredits).not.toHaveBeenCalled();
    store.attachVideoPrediction.mockResolvedValue(makeJob({ status: 'starting' }));
  });
  test('initial dispatch failure retains the prediction for outbox recovery', async () => {
    dispatchVideoCompletion.mockResolvedValue(false);
    const result = await createVideoPrediction({ prompt: 'clip' }, 'owner', 'key');
    expect(result.predictionId).toBe('pred1');
    expect(result.prediction.output).toBeUndefined();
    expect(store.attachVideoPrediction).toHaveBeenCalled();
    expect(refundCredits).not.toHaveBeenCalled();
  });
});
