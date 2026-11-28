import { codeBuilderTask } from '@/src/trigger/codeBuilderTask';
import { runCodeBuilder } from '@/lib/ucol/codeBuilderEngine';
import * as store from '@/lib/code-builder/buildStore';

jest.mock('@trigger.dev/sdk', () => ({ task: (config: unknown) => config, tasks: { onFailure: jest.fn() } }));
jest.mock('@/lib/ucol/codeBuilderEngine', () => ({ runCodeBuilder: jest.fn() }));
jest.mock('@/lib/ucol/buildSession', () => ({ makeBuildSession: jest.fn(() => ({})) }));
jest.mock('@/lib/code-builder/buildStore', () => ({
  createBuild: jest.fn().mockResolvedValue({}),
  updateBuildPhase: jest.fn().mockResolvedValue(undefined),
  checkpointBuild: jest.fn().mockResolvedValue(undefined),
  completeBuild: jest.fn().mockResolvedValue(undefined),
  failBuild: jest.fn().mockResolvedValue(undefined),
}));

const runWorker = (payload: unknown) => (codeBuilderTask as unknown as { run: (payload: unknown) => Promise<unknown> }).run(payload);
const payload = { buildId: 'b1', requestId: 'r1', userId: 'u1', prompt: 'tracker', mode: 'fast' };
const plan = { appName: 'Tracker', components: [{ name: 'Income' }] };
const files = [{ path: 'Income.tsx', language: 'tsx', component: 'Income', content: 'export default () => null;' }];

describe('Code Builder worker checkpoint bridge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (store.checkpointBuild as jest.Mock).mockResolvedValue(undefined);
  });

  test('plan and files are persisted before the whole engine resolves', async () => {
    let finish!: () => void;
    const engineFinished = new Promise<void>(resolve => { finish = resolve; });
    let checkpointed!: () => void;
    const ready = new Promise<void>(resolve => { checkpointed = resolve; });
    (runCodeBuilder as jest.Mock).mockImplementation(async input => {
      await input.onPlanReady(plan);
      await input.onFilesGenerated(files, 1, 1);
      checkpointed();
      await engineFinished;
      return { plan, files };
    });
    const pending = runWorker(payload);
    await ready;
    expect(store.checkpointBuild).toHaveBeenNthCalledWith(1, 'b1', { phase: 'generating', progress: 20, plan });
    expect(store.checkpointBuild).toHaveBeenNthCalledWith(2, 'b1', { phase: 'generating', progress: 95, files });
    expect(store.completeBuild).not.toHaveBeenCalled();
    finish();
    await pending;
    expect(store.completeBuild).toHaveBeenCalledWith('b1', { plan, files });
  });

  test('a failed checkpoint becomes an explicit build failure', async () => {
    (store.checkpointBuild as jest.Mock).mockRejectedValue(new Error('storage unavailable'));
    (runCodeBuilder as jest.Mock).mockImplementation(async input => {
      await input.onPlanReady(plan);
      return { plan, files };
    });
    await expect(runWorker(payload)).rejects.toThrow('storage unavailable');
    expect(store.failBuild).toHaveBeenCalledWith('b1', 'BUILD_FAILED', 'storage unavailable');
    expect(store.completeBuild).not.toHaveBeenCalled();
  });
});
