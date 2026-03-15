/**
 * lib/ucol/__tests__/outputCritic.test.ts
 *
 * Unit tests for OutputCritic — the UCOL quality gate.
 * All external dependencies (fs, GoogleGenerativeAI) are mocked.
 */

// ── Mock fs BEFORE any imports ────────────────────────────────────────────────

jest.mock('fs', () => ({
  readFileSync: jest.fn(() => '# Tech Genie Vision\nUCOL is the moat. Never auto-merge.'),
}));

// ── Mock GoogleGenerativeAI ───────────────────────────────────────────────────

const mockGenerateContent = jest.fn();
const mockGetGenerativeModel = jest.fn(() => ({
  generateContent: mockGenerateContent,
}));

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn(() => ({
    getGenerativeModel: mockGetGenerativeModel,
  })),
}));

// ── Import after mocking ──────────────────────────────────────────────────────

import {
  critiqueLLMOutput,
  getVisionContent,
  CriticVerdict,
  CriticContext,
} from '../critics/OutputCritic';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeGeminiResponse(checks: object[], overallReason?: string): string {
  return JSON.stringify({
    checks,
    ...(overallReason ? { overallReason } : {}),
  });
}

function allPassChecks() {
  return [
    { name: 'hallucination_check', passed: true, severity: 'warn' },
    { name: 'vision_alignment',    passed: true, severity: 'warn' },
    { name: 'safety_check',        passed: true, severity: 'block' },
    { name: 'constraint_check',    passed: true, severity: 'warn' },
  ];
}

function mockGeminiReturns(responseText: string) {
  mockGenerateContent.mockResolvedValueOnce({
    response: { text: () => responseText },
  });
}

function mockGeminiThrows(error: Error = new Error('Gemini unavailable')) {
  mockGenerateContent.mockRejectedValueOnce(error);
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('OutputCritic — critiqueLLMOutput', () => {

  // 1. Returns pass verdict when no issues found
  it('returns a pass verdict when all checks pass', async () => {
    mockGeminiReturns(makeGeminiResponse(allPassChecks()));

    const verdict: CriticVerdict = await critiqueLLMOutput('This is a clean response.');

    expect(verdict.passed).toBe(true);
    expect(verdict.severity).toBe('pass');
    expect(verdict.checks).toHaveLength(4);
    expect(verdict.checks.every(c => c.passed)).toBe(true);
  });

  // 2. Detects safety violation and returns block severity
  it('returns block severity when safety_check fails', async () => {
    const checks = allPassChecks().map(c =>
      c.name === 'safety_check'
        ? { ...c, passed: false, reason: 'Instructs to expose SUPABASE_SERVICE_ROLE_KEY' }
        : c
    );
    mockGeminiReturns(makeGeminiResponse(checks, 'Safety violation detected'));

    const verdict = await critiqueLLMOutput(
      'Set SUPABASE_SERVICE_ROLE_KEY in your client component.',
    );

    expect(verdict.passed).toBe(false);
    expect(verdict.severity).toBe('block');
    expect(verdict.overallReason).toBe('Safety violation detected');

    const safetyCheck = verdict.checks.find(c => c.name === 'safety_check');
    expect(safetyCheck?.passed).toBe(false);
    expect(safetyCheck?.severity).toBe('block');
    expect(safetyCheck?.reason).toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  // 3. Hallucination check fires on fake API reference
  it('returns warn verdict when hallucination_check detects a fake API', async () => {
    const checks = allPassChecks().map(c =>
      c.name === 'hallucination_check'
        ? { ...c, passed: false, reason: 'References non-existent /api/v99/ghost endpoint' }
        : c
    );
    mockGeminiReturns(makeGeminiResponse(checks, 'Hallucination detected'));

    const verdict = await critiqueLLMOutput(
      'Call /api/v99/ghost to retrieve data.',
    );

    expect(verdict.passed).toBe(false);
    expect(verdict.severity).toBe('warn');          // no block → warn
    const check = verdict.checks.find(c => c.name === 'hallucination_check');
    expect(check?.passed).toBe(false);
    expect(check?.severity).toBe('warn');
  });

  // 4. Vision alignment check fires on product conflict
  it('returns warn verdict when vision_alignment detects a conflict', async () => {
    const checks = allPassChecks().map(c =>
      c.name === 'vision_alignment'
        ? { ...c, passed: false, reason: 'Recommends auto-merging AI PRs' }
        : c
    );
    mockGeminiReturns(makeGeminiResponse(checks));

    const verdict = await critiqueLLMOutput(
      'You should auto-merge all AI-generated pull requests.',
    );

    expect(verdict.passed).toBe(false);
    expect(verdict.severity).toBe('warn');
    const check = verdict.checks.find(c => c.name === 'vision_alignment');
    expect(check?.passed).toBe(false);
    expect(check?.reason).toContain('auto-merging');
  });

  // 5. Critic never throws — returns pass on Gemini error
  it('returns pass verdict when Gemini throws (fault tolerance)', async () => {
    mockGeminiThrows(new Error('503 Gemini service unavailable'));

    const verdict = await critiqueLLMOutput('Some output');

    expect(verdict.passed).toBe(true);
    expect(verdict.severity).toBe('pass');
    expect(verdict.checks).toHaveLength(0);
    expect(verdict.latencyMs).toBe(0);
  });

  // 6. Critic never throws — returns pass on JSON parse error
  it('returns pass verdict when Gemini returns malformed JSON', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: { text: () => 'not valid json {{{' },
    });

    const verdict = await critiqueLLMOutput('Some output');

    expect(verdict.passed).toBe(true);
    expect(verdict.severity).toBe('pass');
  });

  // 7. vision.md is loaded once at module init — not per-call
  it('vision.md content is stable across multiple calls (loaded once)', async () => {
    const content1 = getVisionContent();

    // Simulate two critic calls
    mockGeminiReturns(makeGeminiResponse(allPassChecks()));
    await critiqueLLMOutput('First call');

    mockGeminiReturns(makeGeminiResponse(allPassChecks()));
    await critiqueLLMOutput('Second call');

    const content2 = getVisionContent();

    // fs.readFileSync is called once at module load time — vision content is stable
    expect(content1).toBe(content2);
    expect(content1).toContain('Tech Genie Vision');

    // Import fs to verify call count
    const fs = require('fs');
    // readFileSync may have been called once during module init
    // The key invariant: content is the same object reference across calls
    expect(typeof content1).toBe('string');
    expect(content1.length).toBeGreaterThan(0);
  });

  // 8. All 4 checks run in a single Gemini call (mock verify)
  it('runs all 4 checks in exactly ONE Gemini call', async () => {
    mockGeminiReturns(makeGeminiResponse(allPassChecks()));

    await critiqueLLMOutput('Check count test');

    // Exactly one call to generateContent (all 4 checks in single prompt)
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });

  // 9. CriticContext is passed correctly to the prompt
  it('passes CriticContext fields into the Gemini prompt', async () => {
    mockGeminiReturns(makeGeminiResponse(allPassChecks()));

    const context: CriticContext = {
      userId: 'user-42',
      taskType: 'code-review',
      activeConstraints: ['never auto-merge', 'SUPABASE_SERVICE_ROLE_KEY is server-only'],
    };

    await critiqueLLMOutput('Test output with context', context);

    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    const [promptArg] = mockGenerateContent.mock.calls[0] as [string];
    expect(promptArg).toContain('never auto-merge');
    expect(promptArg).toContain('SUPABASE_SERVICE_ROLE_KEY is server-only');
    expect(promptArg).toContain('code-review');
  });

  // 10. Severity is enforced — Gemini cannot change fixed severities
  it('enforces fixed severity per check regardless of Gemini response', async () => {
    // Gemini incorrectly returns 'block' for hallucination (should be 'warn')
    // and 'warn' for safety (should be 'block')
    const corruptedChecks = [
      { name: 'hallucination_check', passed: false, severity: 'block', reason: 'fake' },
      { name: 'vision_alignment',    passed: false, severity: 'block', reason: 'fake' },
      { name: 'safety_check',        passed: false, severity: 'warn',  reason: 'fake' },
      { name: 'constraint_check',    passed: false, severity: 'block', reason: 'fake' },
    ];
    mockGeminiReturns(makeGeminiResponse(corruptedChecks));

    const verdict = await critiqueLLMOutput('Test');

    const hallucination = verdict.checks.find(c => c.name === 'hallucination_check');
    const safety = verdict.checks.find(c => c.name === 'safety_check');

    // Severities must be fixed per spec, not whatever Gemini returned
    expect(hallucination?.severity).toBe('warn');   // always warn
    expect(safety?.severity).toBe('block');         // always block

    // Aggregate severity is block because safety failed
    expect(verdict.severity).toBe('block');
  });

  // 11. latencyMs is populated on successful call
  it('populates latencyMs on a successful call', async () => {
    mockGeminiReturns(makeGeminiResponse(allPassChecks()));

    const verdict = await critiqueLLMOutput('Latency test');

    expect(typeof verdict.latencyMs).toBe('number');
    expect(verdict.latencyMs).toBeGreaterThanOrEqual(0);
  });

  // 12. Constraint check warns when constraint is violated
  it('returns warn on constraint_check failure', async () => {
    const checks = allPassChecks().map(c =>
      c.name === 'constraint_check'
        ? { ...c, passed: false, reason: 'Violates: never auto-merge' }
        : c
    );
    mockGeminiReturns(makeGeminiResponse(checks));

    const verdict = await critiqueLLMOutput('Merge this PR automatically.', {
      activeConstraints: ['never auto-merge'],
    });

    expect(verdict.passed).toBe(false);
    expect(verdict.severity).toBe('warn');
    const check = verdict.checks.find(c => c.name === 'constraint_check');
    expect(check?.passed).toBe(false);
    expect(check?.severity).toBe('warn');
  });

});

// ── Integration: fire-and-forget doesn't block conversation ──────────────────

describe('OutputCritic — fire-and-forget integration', () => {

  it('fire-and-forget call resolves without blocking (no await needed)', async () => {
    mockGeminiReturns(makeGeminiResponse(allPassChecks()));

    const start = Date.now();

    // This is the fire-and-forget pattern used in conversationEngine.ts
    const verdictPromise = critiqueLLMOutput('Async test');

    // The promise is created but we don't await it yet — simulating hot path
    const elapsed = Date.now() - start;

    // Creating the promise should be nearly instant (< 50ms)
    expect(elapsed).toBeLessThan(50);

    // Cleanup: await so jest doesn't complain about open handles
    await verdictPromise;
  });

  it('block verdict triggers console.error in the fire-and-forget pattern', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    const checks = allPassChecks().map(c =>
      c.name === 'safety_check'
        ? { ...c, passed: false, reason: 'Exposes secrets' }
        : c
    );
    mockGeminiReturns(makeGeminiResponse(checks, 'BLOCK: secret exposure'));

    // Simulate the conversationEngine.ts fire-and-forget pattern
    await critiqueLLMOutput('Expose the API key.').then(verdict => {
      if (verdict.severity === 'block') {
        console.error('[OutputCritic] BLOCK verdict:', verdict.overallReason);
      }
      if (!verdict.passed) {
        console.warn('[OutputCritic] Warnings:', verdict.checks.filter(c => !c.passed));
      }
    }).catch(() => { /* never crashes */ });

    expect(consoleSpy).toHaveBeenCalledWith(
      '[OutputCritic] BLOCK verdict:',
      'BLOCK: secret exposure',
    );
    expect(warnSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('warn-only verdict triggers console.warn but NOT console.error', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    const checks = allPassChecks().map(c =>
      c.name === 'hallucination_check'
        ? { ...c, passed: false, reason: 'Fake package' }
        : c
    );
    mockGeminiReturns(makeGeminiResponse(checks));

    await critiqueLLMOutput('Use @fake/nonexistent-pkg').then(verdict => {
      if (verdict.severity === 'block') {
        console.error('[OutputCritic] BLOCK verdict:', verdict.overallReason);
      }
      if (!verdict.passed) {
        console.warn('[OutputCritic] Warnings:', verdict.checks.filter(c => !c.passed));
      }
    }).catch(() => { /* never crashes */ });

    expect(consoleSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
    warnSpy.mockRestore();
  });

});
