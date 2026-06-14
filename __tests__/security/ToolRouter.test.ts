import { ToolRouter } from '../../lib/harness/ToolRouter';
import { IOHarness } from '../../lib/harness/IOHarness';

describe('ToolRouter Security Policy', () => {
  let mockHarness: jest.Mocked<IOHarness>;
  let toolRouter: ToolRouter;

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
    toolRouter = new ToolRouter(mockHarness);
  });

  describe('run_command policy', () => {
    it('should allow safe commands', async () => {
      mockHarness.executeCommandSecure.mockResolvedValue({ ok: true, output: 'Success' });
      
      const result = await toolRouter.dispatch('run_command', {
        command: 'npm test',
        timeoutMs: 5000
      });

      expect(result.ok).toBe(true);
      expect(mockHarness.executeCommandSecure).toHaveBeenCalledWith('npm test', 5, '', '');
    });

    it('should block destructive commands (rm -rf)', async () => {
      const result = await toolRouter.dispatch('run_command', {
        command: 'rm -rf node_modules',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('POLICY_VIOLATION');
        expect(result.error).toContain('Command blocked by security policy');
      }
      expect(mockHarness.executeCommandSecure).not.toHaveBeenCalled();
    });

    it('should block destructive commands (chmod -R 777)', async () => {
      const result = await toolRouter.dispatch('run_command', {
        command: 'chmod -R 777 /',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('POLICY_VIOLATION');
        expect(result.error).toContain('Command blocked by security policy');
      }
      expect(mockHarness.executeCommandSecure).not.toHaveBeenCalled();
    });

    it('should block interactive commands (vim)', async () => {
      const result = await toolRouter.dispatch('run_command', {
        command: 'vim src/index.ts',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('POLICY_VIOLATION');
        expect(result.error).toContain('Command blocked by security policy');
      }
      expect(mockHarness.executeCommandSecure).not.toHaveBeenCalled();
    });

    it('should return schema validation errors for invalid arguments', async () => {
      const result = await toolRouter.dispatch('run_command', {
        // missing command
        timeoutMs: 5000
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('VALIDATION_ERROR');
      }
      expect(mockHarness.executeCommandSecure).not.toHaveBeenCalled();
    });
  });
});
