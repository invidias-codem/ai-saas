import { readFileSync } from 'fs';
const src = readFileSync('lib/ucol/prompts/geminiReviewer.ts', 'utf8');
const m = src.match(/function sanitizeReviewJson[\s\S]*?\n}\n/);
const fnSrc = m![0]
  .replace(/: string/g, '')
  .replace(/const stack\[\] = \[\]/, 'const stack = []');
 
const sanitize = eval(`(${fnSrc})`);

// A review truncated mid-string in "critique" (exactly like the prod logs)
const truncated = `{
  "approved": true,
  "score": 10,
  "critique": "The LoadingSpinner component is correctly implemented, adheres to the spec, and uses the specified tech stack (React, TypeScript, Tailwind CSS). All imports are resolved, and there are no type errors or runtime issues. The component provides a cl`;

try {
  const out = JSON.parse(sanitize(truncated));
  console.log('SALVAGE OK — approved:', out.approved, 'score:', out.score, '| keys:', Object.keys(out).join(','));
} catch (e: any) {
  console.log('SALVAGE FAILED:', e.message);
}

// A complete review should pass through unchanged
const complete = JSON.stringify({ approved: true, score: 9, critique: 'good', suggestions: [], failedCriteria: [], originalityScore: 8, novelPatterns: [], originalityNotes: '', pragmatismScore: 9 });
console.log('complete passthrough:', JSON.parse(sanitize(complete)).score === 9 ? 'OK' : 'BROKEN');
