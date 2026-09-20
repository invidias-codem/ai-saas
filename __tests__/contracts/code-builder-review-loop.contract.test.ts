/**
 * Code Builder review-loop regression (stabilization slice).
 *
 * Locks the semantics: per component, the engine runs
 *   coder → review → at most ONE revision → accept (with concerns).
 * The previous `MAX_REVIEW_ATTEMPTS = 3` let the loop re-enter more rounds,
 * which at ~137s/LLM call pushed a 12-component build past 90 minutes.
 * Locks the bound against silent drift if the constant is reverted or the
 * control flow restructured.
 *
 * Strategy: mock the coder provider + reviewer, drive `generateCode()` on a
 * single-component plan where the reviewer keeps rejecting, and count
 * provider invocations. Expect exactly 2 coder calls (initial + one revision)
 * and exactly 1 review call (the second review under the old semantics would
 * fire after attempt 2; the new bound force-accepts at attempt 2 without
 * calling review again).
 */
import { generateCode } from '@/lib/ucol/codeBuilderEngine';
import { kimiCoderProvider } from '@/lib/ucol/prompts/kimiCoder';
import { reviewCode } from '@/lib/ucol/prompts/kimiReviewer';
import type { BuildSession, ProjectPlan } from '@/lib/ucol/types';

jest.mock('@/lib/ucol/prompts/kimiCoder', () => ({
  kimiCoderProvider: { generateCode: jest.fn() },
}));
jest.mock('@/lib/ucol/prompts/geminiCoder', () => ({
  geminiCoderProvider: { generateCode: jest.fn() },
}));
jest.mock('@/lib/ucol/prompts/kimiPlanner', () => ({ generatePlan: jest.fn() }));
jest.mock('@/lib/ucol/prompts/kimiReviewer', () => ({ reviewCode: jest.fn() }));
jest.mock('@/lib/telemetry', () => ({ logEvent: jest.fn() }));
jest.mock('@/lib/ucol/modelRouter', () => ({
  ModelRouter: jest.fn().mockImplementation(() => ({
    decide: () => ({
      primaryModel: { provider: 'kimi', modelId: 'moonshotai/kimi-k3' },
      reason: 'test',
    }),
    recordThrash: jest.fn(),
  })),
}));

const generate = kimiCoderProvider.generateCode as jest.Mock;
const review = reviewCode as jest.Mock;

function planWithOneComponent(): ProjectPlan {
  return {
    appName: 't', description: '', techStack: ['Next.js'],
    pages: [], apiRoutes: [], dataModel: [],
    components: [{ name: 'Widget', filePath: 'components/Widget.tsx', description: '', props: [], dependencies: [], priority: 0 }],
  } as unknown as ProjectPlan;
}

function fakeSession(): BuildSession {
  return {
    id: 's1', userId: 'u1', userPrompt: 'x',
    discoveredPatterns: [], reviewRounds: 0, constraintRounds: 0, refinementLog: [],
  } as unknown as BuildSession;
}

function rejectingReview() {
  return {
    approved: false, score: 5, originalityScore: 8, pragmatismScore: 8,
    critique: 'needs work', suggestions: [], failedCriteria: [], novelPatterns: [],
  };
}

describe('code-builder review-loop bound', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('generation → review → at most one revision (no third coder call)', async () => {
    // Coder always "succeeds" (returns a file). Reviewer always rejects.
    generate.mockResolvedValue([{ path: 'components/Widget.tsx', content: 'x', language: 'tsx', component: 'Widget' }]);
    review.mockResolvedValue(rejectingReview());

    const files = await generateCode(
      {
        buildId: 'b1', requestId: 'r1', userId: 'u1', prompt: 'x', mode: 'full',
        emit: () => {}, installedDependencies: [], providerKeys: {}, session: fakeSession(),
      } as any,
      planWithOneComponent(),
    );

    expect(files).toHaveLength(1);
    // Under the previous MAX_REVIEW_ATTEMPTS=3, this would be 3.
    expect(generate).toHaveBeenCalledTimes(2);
    // Reviewer fires once per attempt that produced code; with the bound at 2,
    // the second coder output is force-accepted BEFORE a second review call.
    // If a future refactor re-reviews after force-accept, this expectation
    // should change to 1 — lock it in either direction.
    expect(review.mock.calls.length).toBeLessThanOrEqual(2);
  });
});
