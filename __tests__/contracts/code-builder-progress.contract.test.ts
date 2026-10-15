import { runCodeBuilder } from '@/lib/ucol/codeBuilderEngine';
import { generatePlan } from '@/lib/ucol/prompts/kimiPlanner';
import { kimiCoderProvider } from '@/lib/ucol/prompts/kimiCoder';
import { observeBuildProgress } from '@/lib/code-builder/buildProgress';
import type { BuildSession, ProjectPlan, GeneratedFile } from '@/lib/ucol/types';

jest.mock('@/lib/ucol/prompts/kimiPlanner', () => ({ generatePlan: jest.fn() }));
jest.mock('@/lib/ucol/prompts/kimiCoder', () => ({ kimiCoderProvider: { generateCode: jest.fn() } }));
jest.mock('@/lib/ucol/prompts/geminiCoder', () => ({ geminiCoderProvider: { generateCode: jest.fn() } }));
jest.mock('@/lib/ucol/prompts/kimiReviewer', () => ({ reviewCode: jest.fn() }));
jest.mock('@/lib/telemetry', () => ({ logEvent: jest.fn() }));
jest.mock('@/lib/ucol/modelRouter', () => ({
  ModelRouter: jest.fn().mockImplementation(() => ({
    decide: () => ({ primaryModel: { provider: 'kimi', modelId: 'moonshotai/kimi-k3' }, reason: 'test' }),
    recordThrash: jest.fn(),
  })),
}));

const plan: ProjectPlan = {
  appName: 'Tracker', description: 'Budget tracker', techStack: ['React'], pages: [], apiRoutes: [], dataModel: [], reasoning: '',
  components: ['Income', 'Expenses'].map(name => ({ name, filePath: `${name}.tsx`, description: '', props: [], dependencies: [], priority: 0 })),
};
const file = (component: string): GeneratedFile => ({ path: `${component}.tsx`, content: 'export default () => null;', language: 'tsx', component, model: 'moonshotai/kimi-k3' });
const input = () => ({
  buildId: 'b1', requestId: 'r1', userId: 'u1', prompt: 'tracker', mode: 'fast' as const, emit: () => {},
  session: { id: 's1', userId: 'u1', userPrompt: 'tracker', discoveredPatterns: [], reviewRounds: 0, constraintRounds: 0, refinementLog: [] } as unknown as BuildSession,
});

describe('Code Builder incremental output', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (generatePlan as jest.Mock).mockResolvedValue(plan);
    (kimiCoderProvider.generateCode as jest.Mock).mockImplementation(async context => [file(context.payload.content.component.name)]);
  });

  test('persists the plan before spending on the first component', async () => {
    const order: string[] = [];
    const result = await runCodeBuilder({
      ...input(),
      onPlanReady: async value => { expect(value).toEqual(plan); order.push('plan'); },
      onFilesGenerated: async (files, completed, total) => {
        order.push(`files:${completed}`);
        expect(files).toHaveLength(completed);
        expect(total).toBe(2);
      },
    });
    expect(order).toEqual(['plan', 'files:1', 'files:2']);
    expect(result.files).toEqual([file('Income'), file('Expenses')]);
  });

  test('awaits checkpoint persistence and stops generation when persistence fails', async () => {
    await expect(runCodeBuilder({ ...input(), onPlanReady: async () => { throw new Error('checkpoint unavailable'); } })).rejects.toThrow('checkpoint unavailable');
    expect(kimiCoderProvider.generateCode).not.toHaveBeenCalled();
  });

  test('publishes the first component before the second component resolves', async () => {
    let resolveSecond!: (files: GeneratedFile[]) => void;
    const second = new Promise<GeneratedFile[]>(resolve => { resolveSecond = resolve; });
    let firstCheckpoint!: () => void;
    const checkpointReady = new Promise<void>(resolve => { firstCheckpoint = resolve; });
    (kimiCoderProvider.generateCode as jest.Mock).mockResolvedValueOnce([file('Income')]).mockReturnValueOnce(second);
    const snapshots: GeneratedFile[][] = [];
    const pending = runCodeBuilder({
      ...input(),
      onFilesGenerated: async files => { snapshots.push(files); firstCheckpoint(); },
    });
    await checkpointReady;
    expect(snapshots).toEqual([[file('Income')]]);
    resolveSecond([file('Expenses')]);
    await pending;
    expect(snapshots[0]).toHaveLength(1); // Later checkpoints must not mutate earlier snapshots.
    expect(snapshots[1]).toHaveLength(2);
  });
});

describe('Code Builder progress observation', () => {
  test('unchanged successful polls do not reset the progress clock', () => {
    const snapshot = { status: 'running', phase: 'planning', progress: 10, updatedAt: '2026-10-15T00:44:46Z' };
    const start = Date.parse(snapshot.updatedAt);
    const first = observeBuildProgress(null, snapshot, start + 1_500);
    const later = observeBuildProgress(first, snapshot, start + 120_000);
    expect(later.lastChangedAt).toBe(start);
    expect(start + 120_000 - later.lastChangedAt).toBeGreaterThan(90_000);
  });

  test('a real checkpoint advances the progress clock', () => {
    const start = Date.parse('2026-10-15T00:44:46Z');
    const first = observeBuildProgress(null, { status: 'running', phase: 'planning', progress: 10 }, start);
    const later = observeBuildProgress(first, { status: 'running', phase: 'generating', progress: 20 }, start + 120_000);
    expect(later.lastChangedAt).toBe(start + 120_000);
  });
});

describe('Code Builder provider lifetime', () => {
  test('successful generation releases every provider timeout', async () => {
    jest.useFakeTimers();
    try {
      (generatePlan as jest.Mock).mockResolvedValue(plan);
      (kimiCoderProvider.generateCode as jest.Mock).mockImplementation(async context => [file(context.payload.content.component.name)]);
      await runCodeBuilder(input());
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });
});
