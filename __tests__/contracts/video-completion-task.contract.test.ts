jest.mock('@trigger.dev/sdk', () => ({
  task: (config: unknown) => config,
  schedules: { task: (config: unknown) => config },
  wait: { for: jest.fn() },
}));
jest.mock('@/lib/media/videoStore', () => ({
  getOwnedVideoJob: jest.fn(), failVideoJob: jest.fn(), listUndispatchedVideoJobs: jest.fn(),
}));
jest.mock('@/lib/media/videoArtifact', () => ({ advanceVideoJob: jest.fn() }));
jest.mock('@/lib/media/videoDispatch', () => ({ dispatchVideoCompletion: jest.fn() }));
import { videoCompletionTask, videoCompletionRecoveryTask } from '@/src/trigger/videoCompletionTask';
const store = jest.requireMock('@/lib/media/videoStore');
const { advanceVideoJob } = jest.requireMock('@/lib/media/videoArtifact');
const { dispatchVideoCompletion } = jest.requireMock('@/lib/media/videoDispatch');
// SDK registration is mocked so the real task's run callback executes offline.
const completion = videoCompletionTask as unknown as { run: (payload: unknown) => Promise<unknown> };
const recovery = videoCompletionRecoveryTask as unknown as { run: () => Promise<unknown> };
const payload = { jobId: 'e482eb32-349e-4174-a639-80a2dbdfcc8a', userId: 'owner' };

describe('Video completion without a browser', () => {
  beforeEach(() => jest.clearAllMocks());
  test('worker rereads authoritative owner state after upload before reporting success', async () => {
    const pending = { status: 'starting', created_at: new Date().toISOString() };
    store.getOwnedVideoJob.mockResolvedValueOnce(pending).mockResolvedValueOnce({ status: 'succeeded' });
    expect(await completion.run(payload)).toEqual({ status: 'succeeded' });
    expect(store.getOwnedVideoJob).toHaveBeenCalledTimes(2);
    expect(store.getOwnedVideoJob).toHaveBeenCalledWith('owner', payload.jobId, 'id');
    expect(advanceVideoJob).toHaveBeenCalledTimes(1);
  });
  test('scheduled outbox recovery dispatches recorded jobs after an initial outage', async () => {
    const job = { id: payload.jobId, user_id: 'owner', prediction_id: 'pred1' };
    store.listUndispatchedVideoJobs.mockResolvedValue([job]);
    expect(await recovery.run()).toEqual({ checked: 1 });
    expect(dispatchVideoCompletion).toHaveBeenCalledWith(job);
  });
});
