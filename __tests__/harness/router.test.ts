import { ToolRouter } from '@/lib/harness/ToolRouter';
import { IOHarness } from '@/lib/harness/IOHarness';

describe('ToolRouter', () => {
  let mockHarness: jest.Mocked<IOHarness>;
  let router: ToolRouter;

  beforeEach(() => {
    mockHarness = {
      initialize: jest.fn(),
      readFile: jest.fn(),
      writeFile: jest.fn(),
      patchFile: jest.fn(),
      executeCommandSecure: jest.fn(),
      discoverDocuments: jest.fn(),
      extractText: jest.fn(),
      summarizeRepo: jest.fn(),
      semanticSearch: jest.fn(),
      ingestWorkspace: jest.fn(),
      insertEpisodicEvent: jest.fn(),
      searchEpisodicEvents: jest.fn(),
    };
    router = new ToolRouter(mockHarness);
  });

  describe('Router Successful Dispatching', () => {
    it('should route read_file successfully with valid args', async () => {
      mockHarness.readFile.mockResolvedValue({ ok: true, output: 'file content' });
      const result = await router.dispatch('read_file', { filePath: 'src/index.ts' });
      expect(result).toEqual({ ok: true, output: 'file content' });
      expect(mockHarness.readFile).toHaveBeenCalledWith('src/index.ts');
    });

    it('should route write_file successfully with valid args', async () => {
      mockHarness.writeFile.mockResolvedValue({ ok: true, output: 'Successfully wrote file' });
      const result = await router.dispatch('write_file', { filePath: 'src/index.ts', content: 'console.log("hello");' });
      expect(result).toEqual({ ok: true, output: 'Successfully wrote file' });
      expect(mockHarness.writeFile).toHaveBeenCalledWith('src/index.ts', 'console.log("hello");');
    });

    it('should route patch_file successfully with valid args', async () => {
      mockHarness.patchFile.mockResolvedValue({ ok: true, output: 'Successfully patched' });
      const result = await router.dispatch('patch_file', { 
        filePath: 'src/index.ts', 
        search_block: 'search_me', 
        replace_block: 'replace_me' 
      });
      expect(result).toEqual({ ok: true, output: 'Successfully patched' });
      expect(mockHarness.patchFile).toHaveBeenCalledWith('src/index.ts', 'search_me', 'replace_me');
    });

    it('should route run_command successfully with valid args', async () => {
      mockHarness.executeCommandSecure.mockResolvedValue({ ok: true, output: 'success output' });
      const result = await router.dispatch('run_command', { command: 'npm run test', timeoutMs: 15000 });
      expect(result).toEqual({ ok: true, output: 'success output' });
      expect(mockHarness.executeCommandSecure).toHaveBeenCalledWith('npm run test', 15, '', '');
    });

    it('should route run_command using default timeout if not provided', async () => {
      mockHarness.executeCommandSecure.mockResolvedValue({ ok: true, output: 'success output' });
      const result = await router.dispatch('run_command', { command: 'npm run test' });
      expect(result).toEqual({ ok: true, output: 'success output' });
      expect(mockHarness.executeCommandSecure).toHaveBeenCalledWith('npm run test', 30, '', '');
    });
  });

  describe('Router Argument Validation Hardening', () => {
    it('should reject read_file with missing or malformed args before execution', async () => {
      // Missing entirely
      const result1 = await router.dispatch('read_file', {}) as any;
      expect(result1.ok).toBe(false);
      expect(result1.code).toBe('VALIDATION_ERROR');
      expect(result1.error).toContain('Schema validation failed');
      expect(result1.meta?.issues).toBeDefined();
      expect(result1.meta.issues[0].path).toContain('filePath');
      expect(mockHarness.readFile).not.toHaveBeenCalled();

      // Empty string (violating .min(1))
      const result2 = await router.dispatch('read_file', { filePath: '' }) as any;
      expect(result2.ok).toBe(false);
      expect(result2.code).toBe('VALIDATION_ERROR');
      expect(mockHarness.readFile).not.toHaveBeenCalled();

      // Incorrect type
      const result3 = await router.dispatch('read_file', { filePath: 12345 }) as any;
      expect(result3.ok).toBe(false);
      expect(result3.code).toBe('VALIDATION_ERROR');
      expect(mockHarness.readFile).not.toHaveBeenCalled();
    });

    it('should reject write_file with missing, malformed or invalid type args before execution', async () => {
      // Missing content
      const result1 = await router.dispatch('write_file', { filePath: 'test.txt' }) as any;
      expect(result1.ok).toBe(false);
      expect(result1.code).toBe('VALIDATION_ERROR');
      expect(mockHarness.writeFile).not.toHaveBeenCalled();

      // Missing filePath
      const result2 = await router.dispatch('write_file', { content: 'hello' }) as any;
      expect(result2.ok).toBe(false);
      expect(result2.code).toBe('VALIDATION_ERROR');
      expect(mockHarness.writeFile).not.toHaveBeenCalled();

      // Invalid types (e.g., boolean content)
      const result3 = await router.dispatch('write_file', { filePath: 'test.txt', content: true }) as any;
      expect(result3.ok).toBe(false);
      expect(result3.code).toBe('VALIDATION_ERROR');
      expect(mockHarness.writeFile).not.toHaveBeenCalled();
    });

    it('should reject patch_file with missing or empty args', async () => {
      // Missing search_block
      const result1 = await router.dispatch('patch_file', { filePath: 'test.txt', replace_block: 'new' }) as any;
      expect(result1.ok).toBe(false);
      expect(result1.code).toBe('VALIDATION_ERROR');
      expect(mockHarness.patchFile).not.toHaveBeenCalled();

      // Empty search_block string
      const result2 = await router.dispatch('patch_file', { filePath: 'test.txt', search_block: '', replace_block: 'new' }) as any;
      expect(result2.ok).toBe(false);
      expect(result2.code).toBe('VALIDATION_ERROR');
      expect(mockHarness.patchFile).not.toHaveBeenCalled();
    });

    it('should reject run_command with missing, empty, or invalid type command/timeout args', async () => {
      // Empty command string
      const result1 = await router.dispatch('run_command', { command: '' }) as any;
      expect(result1.ok).toBe(false);
      expect(result1.code).toBe('VALIDATION_ERROR');
      expect(mockHarness.executeCommandSecure).not.toHaveBeenCalled();

      // Invalid type for timeoutMs
      const result2 = await router.dispatch('run_command', { command: 'ls', timeoutMs: 'invalid-timeout' }) as any;
      expect(result2.ok).toBe(false);
      expect(result2.code).toBe('VALIDATION_ERROR');
      expect(mockHarness.executeCommandSecure).not.toHaveBeenCalled();
    });
  });

  describe('Policy Gating and Edge Cases', () => {
    it('should reject run_command if command violates security policy', async () => {
      const result = await router.dispatch('run_command', { command: 'rm -rf /' }) as any;
      expect(result.ok).toBe(false);
      expect(result.code).toBe('POLICY_VIOLATION');
      expect(result.error).toContain('Command blocked by security policy');
      expect(mockHarness.executeCommandSecure).not.toHaveBeenCalled();
    });

    it('should reject unknown tool names with UNKNOWN_TOOL code', async () => {
      const result = await router.dispatch('delete_entire_database_tool', {}) as any;
      expect(result.ok).toBe(false);
      expect(result.code).toBe('UNKNOWN_TOOL');
      expect(result.error).toContain('Unknown tool: delete_entire_database_tool');
    });
  });
});
