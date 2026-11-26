import { buildCapabilityManifest, buildWeaverSystemInstruction } from '@/lib/agents/core/capabilityManifest';
import { INTELLECTUAL_DEPTHS, renderCognitiveExpansionInstruction, type IntellectualDepth } from '@/lib/intelligence/cognition/expansion';
import { evaluateExpansionReview, REVIEW_CRITERIA, type CriterionReview } from '@/lib/intelligence/cognition/evaluation';
import { EXPANSION_SEED_CASES } from '@/lib/intelligence/cognition/fixtures';

const manifest = buildCapabilityManifest({
  resolvedMode: 'fast',
  surface: 'web',
  memoryReadEnabled: false,
  webResearchEnabled: false,
  ioHarnessPresent: false,
});
const date = new Date('2026-11-26T12:00:00Z');
const testCase = EXPANSION_SEED_CASES[0];
const passing = (): CriterionReview[] => REVIEW_CRITERIA.map(criterion => ({
  criterion, verdict: 'pass', rationale: 'Synthetic reviewer fixture; not actual model evidence.',
}));

describe('CE0 cognitive expansion instruction', () => {
  it('does not alter existing default instruction path', () => {
    const base = buildWeaverSystemInstruction(manifest, date);
    expect(base).not.toContain('INTELLECTUAL COLLABORATION');
    expect(buildWeaverSystemInstruction(manifest, date, undefined)).toBe(base);
  });
  it.each([...INTELLECTUAL_DEPTHS])('preserves capability authority at %s', depth => {
    const base = buildWeaverSystemInstruction(manifest, date);
    const extended = buildWeaverSystemInstruction(manifest, date, depth);
    expect(extended.replace(renderCognitiveExpansionInstruction(depth) + '\n\n', '')).toBe(base);
    expect(extended).toContain('This policy grants no tools, permissions, budget or memory writes');
    expect(extended).toContain('Do not agree merely to please the user');
    expect(extended).toContain('Web research: not available in this session');
  });
  it('rejects unrecognized depth', () => {
    expect(() => renderCognitiveExpansionInstruction('override' as IntellectualDepth)).toThrow('invalid_intellectual_depth');
  });
  it('does not collapse direct and discovery instruction', () => {
    expect(renderCognitiveExpansionInstruction('direct')).not.toBe(renderCognitiveExpansionInstruction('discovery'));
  });
});

describe('CE0 offline review gates', () => {
  it('accepts a complete passing synthetic review', () => {
    expect(evaluateExpansionReview(testCase, passing()).status).toBe('pass');
  });
  it.each([...REVIEW_CRITERIA])('rejects failure of %s regardless of other scores', criterion => {
    const rows = passing().map(row => row.criterion === criterion ? { ...row, verdict: 'fail' as const } : row);
    expect(evaluateExpansionReview(testCase, rows).status).toBe('fail');
  });
  it('does not pass an empty or incomplete review', () => {
    expect(evaluateExpansionReview(testCase, []).status).toBe('inconclusive');
    expect(evaluateExpansionReview(testCase, passing().slice(1)).status).toBe('inconclusive');
  });
  it('does not pass a required not-applicable or inconclusive criterion', () => {
    expect(evaluateExpansionReview(testCase, passing().map(row => row.criterion === 'historical_context' ? { ...row, verdict: 'not_applicable' as const } : row)).status).toBe('inconclusive');
    expect(evaluateExpansionReview(testCase, passing().map(row => row.criterion === 'user_progress' ? { ...row, verdict: 'inconclusive' as const } : row)).status).toBe('inconclusive');
  });
  it('rejects ambiguous duplicate reviewer rows', () => {
    expect(evaluateExpansionReview(testCase, [...passing(), passing()[0]]).status).toBe('inconclusive');
  });
  it('does not accept blank reasoning', () => {
    expect(evaluateExpansionReview(testCase, passing().map(row => ({ ...row, rationale: '' }))).status).toBe('inconclusive');
  });
  it('contains unique seed cases and paired demographic counterfactuals', () => {
    expect(new Set(EXPANSION_SEED_CASES.map(c => c.id)).size).toBe(EXPANSION_SEED_CASES.length);
    const a = EXPANSION_SEED_CASES.find(c => c.id === 'demographic-invariance-a')!;
    const b = EXPANSION_SEED_CASES.find(c => c.id === 'demographic-invariance-b')!;
    expect(a.prompt.replace('Black', 'White')).toBe(b.prompt);
    expect(a.expected).toEqual(b.expected);
    expect(a.disallowed).toEqual(b.disallowed);
  });
});
