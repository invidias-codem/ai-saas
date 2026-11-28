// __tests__/contracts/execution-runtime.contract.test.ts
// Execution Plane contracts. Locks the #376-style boundary BEFORE any
// provider integration:
//   - UCOL can express + validate an executionRequirement
//   - resolveRuntime is deterministic and abstains rather than guesses
//   - lifecycle surface is exactly six operations
//   - routing compatibility: decisions default to NO_EXECUTION_REQUIRED
//   - purity: no provider SDKs, no network, no I/O in the contract layer

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  ExecutionRequirementSchema,
  NO_EXECUTION_REQUIRED,
  resolveRuntime,
  type ExecutionRuntime,
  type RuntimeCapabilities,
} from '@/lib/intelligence/execution/contracts';

function adapter(id: string, caps: Partial<RuntimeCapabilities>): Pick<ExecutionRuntime, 'id' | 'capabilities'> {
  return {
    id,
    capabilities: {
      runtimeTypes: ['container', 'linux_vm'],
      persistenceScopes: ['request', 'task'],
      durableSuspend: false,
      snapshots: false,
      ...caps,
    },
  };
}

describe('execution runtime contracts — boundary slice', () => {
  it('1: executionRequirement validates through the schema', () => {
    expect(ExecutionRequirementSchema.parse({ required: true, runtimeType: 'linux_vm', persistence: 'task' })).toEqual({
      required: true,
      runtimeType: 'linux_vm',
      persistence: 'task',
    });
    // invalid runtime type rejected
    expect(ExecutionRequirementSchema.safeParse({ required: true, runtimeType: 'quantum', persistence: 'task' }).success).toBe(false);
    // invalid persistence rejected
    expect(ExecutionRequirementSchema.safeParse({ required: true, runtimeType: 'container', persistence: 'forever' }).success).toBe(false);
    // the abstention default validates
    expect(ExecutionRequirementSchema.parse(NO_EXECUTION_REQUIRED)).toEqual(NO_EXECUTION_REQUIRED);
  });

  it('2: resolveRuntime is deterministic and never guesses', () => {
    const daytona = adapter('daytona', { runtimeTypes: ['linux_vm', 'windows_vm', 'macos', 'browser', 'container'], persistenceScopes: ['request', 'task', 'workspace', 'personal'] });
    const modal = adapter('modal', { runtimeTypes: ['container', 'linux_vm'], persistenceScopes: ['request'] });

    const req = { required: true, runtimeType: 'linux_vm' as const, persistence: 'task' as const };
    const a = resolveRuntime(req, [daytona, modal]);
    const b = resolveRuntime(req, [daytona, modal]);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.runtimeId).toBe('daytona');
    expect(a.reason).toBe('runtime_selected');
  });

  it('3: not-required and empty registry abstain with explicit reasons', () => {
    expect(resolveRuntime(NO_EXECUTION_REQUIRED, [adapter('x', {})]).reason).toBe('not_required');
    expect(resolveRuntime({ required: false, runtimeType: 'none', persistence: 'request' }, []).reason).toBe('not_required');
    expect(resolveRuntime({ required: true, runtimeType: 'container', persistence: 'request' }, []).reason).toBe('no_adapters_registered');
  });

  it('4: capability mismatches abstain — typed, never silent', () => {
    const req = { required: true, runtimeType: 'macos' as const, persistence: 'workspace' as const };
    // no adapter has the type
    const miss = resolveRuntime(req, [adapter('local', { runtimeTypes: ['container'] })]);
    expect(miss.runtimeId).toBeNull();
    expect(miss.reason).toBe('runtime_type_unavailable');
    expect(miss.considered).toEqual([]);
    // type matches, persistence does not
    const pers = resolveRuntime(req, [adapter('ephemeral', { runtimeTypes: ['macos'], persistenceScopes: ['request'] })]);
    expect(pers.runtimeId).toBeNull();
    expect(pers.reason).toBe('persistence_unsupported');
    expect(pers.considered).toEqual(['ephemeral']);
  });

  it('5: first matching adapter in registration order wins (deterministic tie-break)', () => {
    const a1 = adapter('alpha', { runtimeTypes: ['container'], persistenceScopes: ['task'] });
    const a2 = adapter('beta', { runtimeTypes: ['container'], persistenceScopes: ['task'] });
    const req = { required: true, runtimeType: 'container' as const, persistence: 'task' as const };
    expect(resolveRuntime(req, [a1, a2]).runtimeId).toBe('alpha');
    expect(resolveRuntime(req, [a2, a1]).runtimeId).toBe('beta');
  });

  it('6: contract layer is pure — no SDK/network/IO imports', () => {
    const src = readFileSync(join(__dirname, '../../lib/intelligence/execution/contracts.ts'), 'utf8');
    expect(src).not.toMatch(/from ['\"]@daytona|from ['\"]modal|fetch\(|axios|undici|supabaseAdmin|Date\.now\(\)|Math\.random\(\)/);
  });

  it('7: lifecycle surface is exactly six operations — no more', () => {
    const src = readFileSync(join(__dirname, '../../lib/intelligence/execution/contracts.ts'), 'utf8');
    const ops = src.match(/^\s{2}(create|resume|execute|snapshot|suspend|destroy)\(/gm) ?? [];
    expect(ops.length).toBe(6);
  });

  it('8: routing decisions carry the defaulted executionRequirement', async () => {
    const mod = await import('@/lib/ucol/routing/decision');
    const decision = mod.buildInitialRoutingDecision({
      request: {
        requestId: 'r1',
        userId: 'u1',
        surface: 'web',
        rawInput: 'hello',
        createdAt: new Date().toISOString(),
      },
      context: {
        surface: 'web',
        preWorkspace: true,
        workspaceBacked: false,
        operatingProfileResolved: false,
        allowedMemoryScopes: [],
      },
      agentMode: 'fast',
    });
    expect(decision.executionRequirement).toEqual(NO_EXECUTION_REQUIRED);
    // and resolves to abstention against any registry
    expect(resolveRuntime(decision.executionRequirement ?? NO_EXECUTION_REQUIRED, [adapter('x', {})]).reason).toBe('not_required');
  });
});
