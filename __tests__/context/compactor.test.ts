import { ContextCompactor } from '../../lib/context/ContextCompactor';

describe('ContextCompactor', () => {
  describe('compact', () => {
    test('returns original text if under token budget', () => {
      const text = 'Short context content';
      const result = ContextCompactor.compact(text, 100);
      expect(result.wasCompacted).toBe(false);
      expect(result.compactedText).toBe(text);
      expect(result.method).toBe('none');
    });

    test('falls back to middle truncate if mode is truncate and exceeds budget', () => {
      const text = 'A'.repeat(400); // ~100 tokens
      const result = ContextCompactor.compact(text, 50, { mode: 'truncate' }); // budget ~200 chars
      expect(result.wasCompacted).toBe(true);
      expect(result.compactedText).toContain('[TRUNCATED');
      expect(result.method).toBe('truncate');
    });

    test('compacts source code using outline mode when code is detected', () => {
      const code = `
import { something } from './utils';
import { another } from './other';

// Standard docstring comment
/**
 * Simple sample class
 */
export class SampleClass {
  public methodOne() {
    const a = 1;
    const b = 2;
    return a + b;
  }

  private methodTwo() {
    console.log('internal');
  }
}
      `;

      // Limit to 75 tokens (approx 300 chars, triggering outline compaction because original is ~83 tokens)
      const result = ContextCompactor.compact(code, 75, { mode: 'outline' });
      expect(result.wasCompacted).toBe(true);
      expect(result.method).toBe('outline');
      expect(result.compactedText).toContain('export class SampleClass');
      expect(result.compactedText).toContain('// [Implementation omitted for space]');
      expect(result.compactedText).not.toContain('const a = 1;');
    });

    test('compacts prose/markdown using summary mode', () => {
      const text = `
# Title of Document
This is the main introduction paragraph. It explains the core concepts of the library.

- Section 1 item which is very detailed and explains all the specific edge cases for users.
- Section 2 item which describes how everything works under the hood.

Here is some additional text that will be truncated if needed.
      `;

      // Limit to 70 tokens (approx 280 chars, triggering summary compaction because original is ~84 tokens)
      const result = ContextCompactor.compact(text, 70, { mode: 'summary' });
      expect(result.wasCompacted).toBe(true);
      expect(result.method).toBe('summary');
      expect(result.compactedText).toContain('# Title');
      expect(result.compactedText).toContain('- Section 1 item');
    });
  });
});
