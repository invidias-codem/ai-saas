/**
 * Host preflight checks (TypeScript port of Python preflight.py).
 *
 * All checks are read-only and safe to run from a coding agent context.
 */
import * as net from 'net';
import { execSync } from 'child_process';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import * as z from 'zod';

export const preflightResultSchema = z.object({
  step: z.number().int().positive(),
  name: z.string(),
  passed: z.boolean(),
  detail: z.string(),
  fix: z.string(),
});

export type PreflightResult = z.infer<typeof preflightResultSchema>;

function run(cmd: string[], timeout = 30): { code: number; stdout: string; stderr: string } {
  try {
    const out = execSync(cmd.join(' '), { encoding: 'utf8', timeout, stdio: ['pipe', 'pipe', 'pipe'] });
    return { code: 0, stdout: out, stderr: '' };
  } catch (e: any) {
    const code = e.status ?? 1;
    const stdout = e.stdout ?? '';
    const stderr = e.stderr ?? '';
    return { code, stdout, stderr };
  }
}

export function checkDockerDaemon(): PreflightResult {
  const r = run(['docker', 'info']);
  if (r.code === 0) {
    const ver = r.stdout.split('\n').find((l) => l.startsWith('Server Version:'));
    return { step: 1, name: 'Docker daemon', passed: true, detail: ver ? ver.split(':')[1].trim() : 'Docker running', fix: '' };
  }
  if (r.code === 127) return { step: 1, name: 'Docker daemon', passed: false, detail: 'Docker CLI not found', fix: 'Install Docker: https://docs.docker.com/get-docker/' };
  const stderr = (r.stderr || r.stdout || '').toLowerCase();
  if (stderr.includes('permission denied')) return { step: 1, name: 'Docker daemon', passed: false, detail: 'Docker requires sudo — add current user to docker group', fix: 'sudo usermod -aG docker $USER' };
  if (stderr.includes('cannot connect')) return { step: 1, name: 'Docker daemon', passed: false, detail: 'Docker daemon not running', fix: 'Start Docker Desktop or run: sudo systemctl start docker' };
  return { step: 1, name: 'Docker daemon', passed: false, detail: (r.stderr || r.stdout || 'unknown error').slice(0, 200), fix: 'Check Docker logs' };
}

export function checkComposeV2(): PreflightResult {
  if (fs.existsSync('/usr/local/bin/docker-compose') || fs.existsSync('/usr/bin/docker-compose')) {
    const r = run(['docker-compose', '--version']);
    if (r.code === 0 && /v1/i.test(r.stdout + r.stderr)) {
      return { step: 2, name: 'Docker Compose v2', passed: false, detail: 'Deprecated docker-compose v1 found', fix: 'Upgrade to Compose v2: https://docs.docker.com/compose/install/' };
    }
  }
  const r = run(['docker', 'compose', 'version']);
  if (r.code === 0) return { step: 2, name: 'Docker Compose v2', passed: true, detail: r.stdout.trim(), fix: '' };
  return { step: 2, name: 'Docker Compose v2', passed: false, detail: 'Docker Compose v2 not installed', fix: 'https://docs.docker.com/compose/install/' };
}

export function checkHostResources(): PreflightResult {
  const minRamGb = 4;
  const minCpus = 2;

  let ramGb = 0;
  if (process.platform === 'linux' && fs.existsSync('/proc/meminfo')) {
    const mem = fs.readFileSync('/proc/meminfo', 'utf8');
    const m = mem.match(/^MemTotal:\s+(\d+) kB$/m);
    if (m) ramGb = parseInt(m[1], 10) / (1024 * 1024);
  } else if (process.platform === 'darwin') {
    const r = run(['sysctl', '-n', 'hw.memsize']);
    if (r.code === 0) ramGb = parseInt(r.stdout.trim(), 10) / 1024 ** 3;
  }

  const cpus = os.cpus().length;
  const issues: string[] = [];
  if (ramGb > 0 && ramGb < minRamGb) issues.push(`RAM ${ramGb.toFixed(1)}GB < ${minRamGb}GB minimum`);
  if (cpus < minCpus) issues.push(`CPUs ${cpus} < ${minCpus} minimum`);

  if (issues.length) return { step: 3, name: 'Host resources', passed: false, detail: issues.join('; '), fix: 'Increase RAM/CPU in Docker Desktop settings' };
  const parts: string[] = [];
  if (ramGb > 0) parts.push(`${ramGb.toFixed(1)}GB RAM`);
  parts.push(`${cpus} CPUs`);
  return { step: 3, name: 'Host resources', passed: true, detail: parts.join(', ') || 'OK', fix: '' };
}

export function checkPorts(ports: number[] = [3000, 5432, 6379]): PreflightResult {
  const blocked: number[] = [];
  for (const port of ports) {
    try {
      const s = net.createConnection(port, '127.0.0.1');
      s.destroy();
      blocked.push(port);
    } catch {
      // port is open
    }
  }
  if (blocked.length) return { step: 4, name: 'Port availability', passed: false, detail: `port(s) ${blocked} occupied`, fix: 'Stop conflicting services or use --port to override' };
  return { step: 4, name: 'Port availability', passed: true, detail: `ports ${ports} available`, fix: '' };
}

export function checkDiskSpace(minGb = 8): PreflightResult {
  let freeGb = 0;
  try {
    const r = run(['df', '-g', '/']);
    const lines = r.stdout.split('\n');
    const last = lines[lines.length - 1];
    const cols = last.trim().split(/\s+/);
    freeGb = parseInt(cols[3], 10);
  } catch {
    return { step: 5, name: 'Disk space', passed: true, detail: 'could not check disk space', fix: '' };
  }
  if (freeGb < minGb) return { step: 5, name: 'Disk space', passed: false, detail: `${freeGb.toFixed(1)}GB free (${minGb}GB required)`, fix: 'Free up disk space: docker system prune -af' };
  return { step: 5, name: 'Disk space', passed: true, detail: `${freeGb.toFixed(1)}GB free`, fix: '' };
}

export function checkDockerAuth(): PreflightResult {
  const cfg = path.join(os.homedir(), '.docker', 'config.json');
  if (!fs.existsSync(cfg)) return { step: 6, name: 'Docker Hub auth', passed: false, detail: 'not authenticated', fix: 'Run: lattice auth login' };
  try {
    const data = JSON.parse(fs.readFileSync(cfg, 'utf8'));
    const auths = data.auths || {};
    const known = ['https://index.docker.io/v1/', 'docker.io', 'registry-1.docker.io'];
    for (const reg of known) if (auths[reg]) return { step: 6, name: 'Docker Hub auth', passed: true, detail: `authenticated (${reg})`, fix: '' };
    if (Object.keys(auths).length) {
      return { step: 6, name: 'Docker Hub auth', passed: true, detail: `authenticated to ${Object.keys(auths)[0].split('/').pop()}`, fix: '' };
    }
    return { step: 6, name: 'Docker Hub auth', passed: false, detail: 'no auths found', fix: 'Run: lattice auth login' };
  } catch {
    return { step: 6, name: 'Docker Hub auth', passed: false, detail: 'could not read docker config', fix: 'Run: lattice auth login' };
  }
}

export function runAllPreflight(skipAuth = false, skipPorts = false, customPorts?: number[]): PreflightResult[] {
  const checks: PreflightResult[] = [checkDockerDaemon(), checkComposeV2(), checkHostResources()];
  checks.push(skipPorts ? { step: 4, name: 'Port availability', passed: true, detail: 'skipped', fix: '' } : checkPorts(customPorts));
  checks.push(checkDiskSpace());
  if (skipAuth) checks.push({ step: 6, name: 'Docker Hub auth', passed: true, detail: 'skipped (air-gapped)', fix: '' });
  else checks.push(checkDockerAuth());
  return checks;
}
