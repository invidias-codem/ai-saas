import * as path from 'path';
import * as fs from 'fs/promises';
import { HarnessFactory, HarnessConfig } from '@/lib/harness/IOHarness';
import { GoIOHarness } from '@/lib/harness/GoIOHarness';

describe.skip('HarnessFactory', () => {
  const tempDir = path.resolve(__dirname, 'temp-factory-test');

  beforeAll(async () => {
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('Local Environment Instantiation', () => {
    it('should successfully instantiate a GoIOHarness when env is "local"', async () => {
      const config: HarnessConfig = {
        env: 'local',
        workspaceRoot: tempDir,
      };

      const harness = await HarnessFactory.create(config);
      expect(harness).toBeInstanceOf(GoIOHarness);
      harness.shutdown?.();
    });
  });

  describe('Unsupported Environment Detection', () => {
    it('should throw an error for completely unsupported environments at runtime', async () => {
      // Cast config to bypass TypeScript checks and verify runtime defense-in-depth
      const config = {
        env: 'unsupported-environment-type',
        workspaceRoot: tempDir,
      } as any;

      await expect(HarnessFactory.create(config)).rejects.toThrow('Unsupported harness environment: unsupported-environment-type');
    });
  });

  describe('Future Antigravity Integration & Configuration Expectations', () => {
    it('should throw "Antigravity harness not yet implemented" when env is "antigravity"', async () => {
      const config: HarnessConfig = {
        env: 'antigravity',
        workspaceRoot: tempDir,
        antigravityEndpoint: 'https://sandbox.antigravity.ai',
        antigravityToken: 'test-token-xyz',
      };

      await expect(HarnessFactory.create(config)).rejects.toThrow('Antigravity harness not yet implemented.');
    });

    it('should maintain type and config expectations for future antigravity configuration fields', () => {
      // Create a configuration that fulfills the defined interface contract for future antigravity
      const validAntigravityConfig: HarnessConfig = {
        env: 'antigravity',
        workspaceRoot: tempDir,
        antigravityEndpoint: 'https://sandbox.antigravity.ai',
        antigravityToken: 'token-12345'
      };

      expect(validAntigravityConfig.env).toBe('antigravity');
      expect(validAntigravityConfig.antigravityEndpoint).toBe('https://sandbox.antigravity.ai');
      expect(validAntigravityConfig.antigravityToken).toBe('token-12345');
    });

    it('should reject antigravity integration regardless of whether endpoint/tokens are fully supplied or not', async () => {
      const configurationWithoutCredentials: HarnessConfig = {
        env: 'antigravity',
        workspaceRoot: tempDir
      };

      await expect(HarnessFactory.create(configurationWithoutCredentials)).rejects.toThrow('Antigravity harness not yet implemented.');
    });
  });
});
