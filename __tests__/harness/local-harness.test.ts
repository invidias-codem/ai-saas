import * as path from 'path';
import * as fs from 'fs/promises';
import { LocalIOHarness } from '@/lib/harness/LocalIOHarness';

describe('LocalIOHarness', () => {
  const tempDir = path.resolve(__dirname, 'temp-harness-test');
  let harness: LocalIOHarness;

  beforeAll(async () => {
    // Ensure the temp directory is clean and exists
    await fs.mkdir(tempDir, { recursive: true });
    harness = new LocalIOHarness(tempDir);
    await harness.initialize();
  });

  afterAll(async () => {
    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('Initialization and Safe Path Validation (Jailbreak Defenses)', () => {
    it('should throw during initialization if the workspace root does not exist', async () => {
      const nonExistentHarness = new LocalIOHarness(path.resolve(tempDir, 'non-existent-subfolder-xyz'));
      await expect(nonExistentHarness.initialize()).rejects.toThrow('Failed to initialize harness');
    });

    it('should block read operations attempting path traversal outside workspaceRoot via relative dots', async () => {
      const result = await harness.readFile('../outside-file.txt') as any;
      expect(result.ok).toBe(false);
      expect(result.code).toBe('READ_ERROR');
      expect(result.error).toContain('escapes workspace root');
    });

    it('should block read operations for absolute system paths', async () => {
      const result = await harness.readFile('/etc/passwd') as any;
      expect(result.ok).toBe(false);
      expect(result.code).toBe('READ_ERROR');
      expect(result.error).toContain('escapes workspace root');
    });

    it('should block read operations using nested relative traversals escaping root', async () => {
      const result = await harness.readFile('subfolder/../../outside-file.txt') as any;
      expect(result.ok).toBe(false);
      expect(result.code).toBe('READ_ERROR');
      expect(result.error).toContain('escapes workspace root');
    });

    it('should allow reading nested paths that remain inside the workspace root', async () => {
      const testFile = 'subfolder/inner/nested.txt';
      await harness.writeFile(testFile, 'nested data');
      const result = await harness.readFile('subfolder/inner/../../subfolder/inner/nested.txt') as any;
      expect(result.ok).toBe(true);
      expect(result.output).toBe('nested data');
    });

    it('should block write operations attempting path traversal outside workspaceRoot', async () => {
      const result = await harness.writeFile('../outside-file.txt', 'illegal content') as any;
      expect(result.ok).toBe(false);
      expect(result.code).toBe('WRITE_ERROR');
      expect(result.error).toContain('escapes workspace root');
    });

    it('should block patch operations attempting path traversal outside workspaceRoot', async () => {
      const result = await harness.patchFile('../outside-file.txt', 'search', 'replace') as any;
      expect(result.ok).toBe(false);
      expect(result.code).toBe('PATCH_ERROR');
      expect(result.error).toContain('escapes workspace root');
    });
  });

  describe('File Read, Write, and Patch Operations', () => {
    it('should successfully write and read a file within the workspace root', async () => {
      const testFile = 'subfolder/test.txt';
      const content = 'Hello world!\nThis is a verified test.';

      const writeResult = await harness.writeFile(testFile, content) as any;
      expect(writeResult.ok).toBe(true);
      expect(writeResult.output).toContain('Successfully wrote to');

      const readResult = await harness.readFile(testFile) as any;
      expect(readResult.ok).toBe(true);
      expect(readResult.output).toBe(content);
    });

    it('should patch a file successfully when there is exactly one match', async () => {
      const testFile = 'patch-test.txt';
      const initialContent = 'line 1\nTARGET_LINE\nline 3';
      await harness.writeFile(testFile, initialContent);

      const patchResult = await harness.patchFile(testFile, 'TARGET_LINE', 'REPLACED_LINE') as any;
      expect(patchResult.ok).toBe(true);
      expect(patchResult.output).toContain('Successfully patched');

      const readResult = await harness.readFile(testFile) as any;
      expect(readResult.output).toBe('line 1\nREPLACED_LINE\nline 3');
    });

    it('should fail to patch a file if the search block is not found', async () => {
      const testFile = 'patch-fail-notfound.txt';
      await harness.writeFile(testFile, 'some random content');

      const patchResult = await harness.patchFile(testFile, 'NON_EXISTENT_TEXT', 'REPLACEMENT') as any;
      expect(patchResult.ok).toBe(false);
      expect(patchResult.code).toBe('SEARCH_BLOCK_NOT_FOUND');
      expect(patchResult.error).toContain('Search block not found');
    });

    it('should fail to patch a file if multiple occurrences of the search block are found', async () => {
      const testFile = 'patch-fail-multiple.txt';
      await harness.writeFile(testFile, 'duplicate text\nsome other text\nduplicate text');

      const patchResult = await harness.patchFile(testFile, 'duplicate text', 'single replacement') as any;
      expect(patchResult.ok).toBe(false);
      expect(patchResult.code).toBe('MULTIPLE_MATCHES');
      expect(patchResult.error).toContain('Multiple matches found');
    });

    it('should handle replacement blocks containing special JS replace tokens ($$, $&, $`, $\', $1) safely without expansion', async () => {
      const testFile = 'patch-special-char-safety.txt';
      const initialContent = '// setup\nREPLACE_ME_TOKEN\n// teardown';
      await harness.writeFile(testFile, initialContent);

      // Special string patterns that normally trigger substitution in String.prototype.replace
      const replacementWithSpecialChars = 'const val = "$$ && $& && $` && $\' && $1 && $PORT";';

      const patchResult = await harness.patchFile(testFile, 'REPLACE_ME_TOKEN', replacementWithSpecialChars) as any;
      expect(patchResult.ok).toBe(true);

      const readResult = await harness.readFile(testFile) as any;
      // It should replace the search block literally with absolutely no expansion or truncation of special patterns
      expect(readResult.output).toBe(`// setup\n${replacementWithSpecialChars}\n// teardown`);
    });
  });

  describe('Command Execution Limits (Timeout and Truncation)', () => {
    it('should run a benign command successfully', async () => {
      const result = await harness.executeCommandSecure('echo "harness test success"', 30, 'test-ws', 'test-user') as any;
      expect(result.ok).toBe(true);
      expect(result.output).toBe('harness test success');
      expect(result.meta).toEqual(
        expect.objectContaining({
          code: 0,
          isTruncated: false,
          isTimedOut: false,
        })
      );
    });

    it('should aggressively terminate command execution if it times out via custom timeoutSeconds', async () => {
      const start = Date.now();
      const result = await harness.executeCommandSecure('sleep 5', 0.15, 'test-ws', 'test-user') as any;
      const duration = Date.now() - start;

      expect(result.ok).toBe(false);
      expect(result.code).toBe('COMMAND_FAILED');
      expect(result.error).toContain('Command timed out');
      expect(result.meta?.isTimedOut).toBe(true);
      expect(result.error).toContain('[OUTPUT TRUNCATED DUE TO TIMEOUT]');
      // Ensure the execution was actually halted and did not wait for 5 seconds
      expect(duration).toBeLessThan(1000);
    });

    it('should aggressively terminate and truncate output if it exceeds size limits', async () => {
      // Limit is 512KB. Let's write a node snippet that outputs 600KB.
      const result = await harness.executeCommandSecure('node -e "console.log(\'a\'.repeat(600 * 1024))"', 30, 'test-ws', 'test-user') as any;
      expect(result.ok).toBe(false);
      expect(result.code).toBe('COMMAND_FAILED');
      expect(result.error).toContain('Command terminated due to output size limit');
      expect(result.meta?.isTruncated).toBe(true);
      expect(result.error).toContain('[OUTPUT TRUNCATED DUE TO SIZE LIMIT]');
      // Result size should be capped at around the maxOutputBytes (512KB) + standard labels
      expect(result.error!.length).toBeLessThan(1024 * 515);
    });

    it('should allow outputs that are strictly below the size limit without truncation', async () => {
      // 100KB output
      const result = await harness.executeCommandSecure('node -e "console.log(\'a\'.repeat(100 * 1024))"', 30, 'test-ws', 'test-user') as any;
      expect(result.ok).toBe(true);
      expect(result.meta?.isTruncated).toBe(false);
      expect(result.output.length).toBe(100 * 1024);
    });

    it('should return ok: false and COMMAND_FAILED for invalid commands (exit 127)', async () => {
      const result = await harness.executeCommandSecure('non_existent_command_xyz_123', 30, 'test-ws', 'test-user') as any;
      expect(result.ok).toBe(false);
      expect(result.code).toBe('COMMAND_FAILED');
      expect(result.meta?.code).toBe(127);
    });
  });
});
