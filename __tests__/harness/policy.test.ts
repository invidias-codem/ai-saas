import { PolicyEngine } from '@/lib/harness/policy';

describe('PolicyEngine', () => {
  describe('Destructive Commands Gating', () => {
    it('should block basic destructive commands', () => {
      const blocked = [
        'rm -rf /',
        'rm -f important_file',
        'sudo apt-get install some-package',
        'chmod -R 777 .',
        'mv * /',
        'dd if=/dev/zero of=/dev/sda',
        'mkfs.ext4 /dev/sda1',
      ];

      blocked.forEach((cmd) => {
        const result = PolicyEngine.evaluateCommand(cmd);
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('destructive command');
      });
    });

    it('should block destructive commands with spacing variations', () => {
      const spacingVariations = [
        'rm    -rf    /',
        'rm \t -rf \t /',
        'rm\n-rf\n/',
        'chmod   -R   777   .',
      ];

      spacingVariations.forEach((cmd) => {
        const result = PolicyEngine.evaluateCommand(cmd);
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('destructive command');
      });
    });

    it('should block destructive commands with uppercase/mixedcase variations', () => {
      const mixedCase = [
        'RM -RF /',
        'Sudo apt-get update',
        'sUdO apt-get install git',
        'CHMOD -R 777 .',
        'DD if=/dev/zero',
      ];

      mixedCase.forEach((cmd) => {
        const result = PolicyEngine.evaluateCommand(cmd);
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('destructive command');
      });
    });

    it('should block destructive commands when chained or embedded', () => {
      const chained = [
        'echo "safe" && rm -rf /',
        'rm -rf / || echo "safe"',
        'echo "running sudo" && sudo apt-get update',
        'if [ -f file ]; then rm -rf /; fi',
      ];

      chained.forEach((cmd) => {
        const result = PolicyEngine.evaluateCommand(cmd);
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('destructive command');
      });
    });

    it('should block destructive commands inside subshells and backticks', () => {
      const subshells = [
        '$(rm -rf /)',
        'nested=$(sudo apt-get update)',
        '`rm -rf /`',
        'echo `sudo apt-get update`',
      ];

      subshells.forEach((cmd) => {
        const result = PolicyEngine.evaluateCommand(cmd);
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('destructive command');
      });
    });

    it('should block destructive commands when used in pipelines', () => {
      const piped = [
        'cat list.txt | xargs rm -rf',
        'echo "password" | sudo -S command',
        'dd if=/dev/zero | split -b 1G',
      ];

      piped.forEach((cmd) => {
        const result = PolicyEngine.evaluateCommand(cmd);
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('destructive command');
      });
    });
  });

  describe('Interactive Commands Gating', () => {
    it('should block basic interactive commands', () => {
      const blocked = [
        'vim index.ts',
        'nano config.json',
        'vi file.txt',
        'top',
        'htop',
        'less log.txt',
        'more log.txt',
        'man ls',
        'ssh user@host',
        'ftp host',
      ];

      blocked.forEach((cmd) => {
        const result = PolicyEngine.evaluateCommand(cmd);
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('interactive command');
      });
    });

    it('should block interactive commands in pipelines and chains', () => {
      const pipedAndChained = [
        'cat log.txt | less',
        'git diff | more',
        'ssh user@host "echo hello"',
        'nano file.txt && echo "file edited"',
        'man grep | grep "regex"',
      ];

      pipedAndChained.forEach((cmd) => {
        const result = PolicyEngine.evaluateCommand(cmd);
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('interactive command');
      });
    });

    it('should block interactive commands case-insensitively', () => {
      const mixedCase = [
        'VIM index.ts',
        'nAnO config.json',
        'TOP',
        'SSH user@host',
      ];

      mixedCase.forEach((cmd) => {
        const result = PolicyEngine.evaluateCommand(cmd);
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('interactive command');
      });
    });
  });

  describe('Safe/Benign Commands Allowance', () => {
    it('should allow common safe development commands', () => {
      const allowed = [
        'npm run dev',
        'npm install',
        'npm run build',
        'npm test',
        'git status',
        'git diff --stat',
        'git add .',
        'ls -la',
        'echo "hello world"',
        'cat package.json',
        'jest __tests__/harness/policy.test.ts',
        'mkdir -p src/components',
        'touch src/types.ts',
        'tsc --noEmit',
      ];

      allowed.forEach((cmd) => {
        const result = PolicyEngine.evaluateCommand(cmd);
        expect(result.allowed).toBe(true);
        expect(result.reason).toBeUndefined();
      });
    });
  });
});
