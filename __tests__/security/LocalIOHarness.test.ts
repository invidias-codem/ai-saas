import { LocalIOHarness } from '../../lib/harness/LocalIOHarness';
import * as path from 'path';
import * as fs from 'fs/promises';

describe('LocalIOHarness', () => {
  let harness: LocalIOHarness;
  const workspaceRoot = path.join(__dirname, 'test-workspace');
  const testFilePath = 'test-file.txt';
  const absoluteTestFilePath = path.join(workspaceRoot, testFilePath);

  beforeAll(async () => {
    await fs.mkdir(workspaceRoot, { recursive: true });
    harness = new LocalIOHarness(workspaceRoot);
    await harness.initialize();
  });

  afterAll(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  beforeEach(async () => {
    const initialContent = `Line 1
Line 2
Target Block
Line 4
Target Block
Line 6`;
    await fs.writeFile(absoluteTestFilePath, initialContent, 'utf8');
  });

  describe('patchFile', () => {
    it('should successfully patch a file if there is an exact single match', async () => {
      const searchBlock = `Line 2\nTarget Block\nLine 4`;
      const replaceBlock = `Line 2\nNew Block\nLine 4`;

      const result = await harness.patchFile(testFilePath, searchBlock, replaceBlock);

      expect(result.ok).toBe(true);

      const updatedContent = await fs.readFile(absoluteTestFilePath, 'utf8');
      expect(updatedContent).toContain('New Block');
      expect(updatedContent).not.toContain(searchBlock);
    });

    it('should fail if the search block is not found', async () => {
      const searchBlock = `Non-existent Block`;
      const replaceBlock = `New Block`;

      const result = await harness.patchFile(testFilePath, searchBlock, replaceBlock);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('SEARCH_BLOCK_NOT_FOUND');
      }

      const updatedContent = await fs.readFile(absoluteTestFilePath, 'utf8');
      expect(updatedContent).not.toContain('New Block');
    });

    it('should fail if there are multiple matches', async () => {
      const searchBlock = `Target Block`;
      const replaceBlock = `New Block`;

      const result = await harness.patchFile(testFilePath, searchBlock, replaceBlock);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('MULTIPLE_MATCHES');
      }

      const updatedContent = await fs.readFile(absoluteTestFilePath, 'utf8');
      expect(updatedContent).not.toContain('New Block');
    });
  });
});
