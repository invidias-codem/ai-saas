// __tests__/contracts/engineering-evidence.contract.test.ts
// EI-4D D4: Qualification tests for engineering evidence enforcement.
//
// Synthetic regression fixtures representing the false completion claims
// observed in #558 (Windows IPC) and #559 (Remote MCP):
//   1. Authorization function that always returns true.
//   2. Session ownership check omitted.
//   3. Missing dependency lockfile update.
//   4. Windows-only code tested exclusively on macOS.
//   5. Authentication helper present but not invoked correctly.
//   6. Passing tests from an outdated commit.
//   7. Security qualification submitted by the implementing agent.
//
// Independent test assertions and verifier-produced evidence — agent-authored
// claims are never trusted.

import {
  AcceptanceStatus,
  claimDigest,
  EngineeringClaim,
  sealClaim,
  verifyClaimDigest,
} from '@/lib/engineering-evidence/contracts';
import { validateEngineeringClaim } from '@/lib/engineering-evidence/validation';
import {
  canQualifySecurity,
  canTransition,
} from '@/lib/engineering-evidence/state-machine';

const COMMIT = 'abc123def456';
const REPO = 'invidias-codem/ai-saas';

const baseClaim: EngineeringClaim = {
  claimId: '00000000-0000-0000-0000-000000000000',
  targetIdentity: 'test target',
  repository: REPO,
  commitSha: COMMIT,
  sourcePath: 'src/test.ts',
  sourceRange: { startLine: 1, endLine: 10 },
  securityInvariant: 'fail-closed auth',
  enforcementPath: 'validate_auth_token',
  verificationCommand: 'cargo test --features windows-ipc',
  testIdentity: 'test_security_replay_rejected',
  verificationEnvironment: 'Windows CI MSVC',
  observedResult: '19/19 tests pass',
  artifactDigest: '', // filled by sealClaim
  coverageLimitations: ['Windows compilation not verifiable locally'],
  verifierIdentity: 'independent-verifier',
  contradictoryEvidence: [],
  acceptanceStatus: 'BEHAVIOR_VERIFIED',
};

const ctx = {
  candidateCommit: COMMIT,
  candidateRepository: REPO,
  requiredSecurityTests: ['test_security_replay_rejected'],
  requiredVerificationCommands: ['cargo test --features windows-ipc'],
  acceptedRuntimeEnvironments: ['Windows CI MSVC'],
  implementerIdentity: 'implementer-agent',
};

describe('D1 — Engineering claim contract', () => {
  it('sealClaim computes a deterministic artifact digest', () => {
    const sealed = sealClaim(baseClaim);
    expect(sealed.artifactDigest).toBe(claimDigest(baseClaim));
    expect(verifyClaimDigest(sealed).valid).toBe(true);
  });

  it('tampering with any field invalidates the digest', () => {
    const sealed = sealClaim(baseClaim);
    const tampered = { ...sealed, observedResult: '0/19 tests pass' };
    expect(verifyClaimDigest(tampered).valid).toBe(false);
  });

  it('canonical serialization is deterministic', () => {
    const a = sealClaim(baseClaim);
    const b = sealClaim({ ...baseClaim });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('D2 — Evidence validation rejects false claims', () => {
  it('rejects missing source identity (sourcePath)', () => {
    const claim = sealClaim({ ...baseClaim, sourcePath: '' });
    const result = validateEngineeringClaim(claim, ctx);
    expect(result.valid).toBe(false);
    expect(result.reasons.join(' ')).toContain('missing source identity');
  });

  it('rejects evidence associated with a different commit', () => {
    const claim = sealClaim({ ...baseClaim, commitSha: 'deadbeef' });
    const result = validateEngineeringClaim(claim, ctx);
    expect(result.valid).toBe(false);
    expect(result.reasons.join(' ')).toContain('commit mismatch');
  });

  it('rejects missing verification environment', () => {
    const claim = sealClaim({ ...baseClaim, verificationEnvironment: '' });
    const result = validateEngineeringClaim(claim, ctx);
    expect(result.valid).toBe(false);
    expect(result.reasons.join(' ')).toContain('missing verification environment');
  });

  it('rejects unaccepted verification environment (macOS-only for Windows code)', () => {
    const claim = sealClaim({ ...baseClaim, verificationEnvironment: 'macOS cargo' });
    const result = validateEngineeringClaim(claim, ctx);
    expect(result.valid).toBe(false);
    expect(result.reasons.join(' ')).toContain('unaccepted verification environment');
  });

  it('rejects invalid artifact hash', () => {
    const claim = sealClaim(baseClaim);
    const tampered = { ...claim, artifactDigest: '0000' };
    const result = validateEngineeringClaim(tampered, ctx);
    expect(result.valid).toBe(false);
    expect(result.reasons.join(' ')).toContain('invalid artifact hash');
  });

  it('rejects missing security test evidence', () => {
    const claim = sealClaim({ ...baseClaim, testIdentity: 'test_helper_passes' });
    const result = validateEngineeringClaim(claim, ctx);
    expect(result.valid).toBe(false);
    expect(result.reasons.join(' ')).toContain('missing security test evidence');
  });

  it('rejects self-approved security qualification', () => {
    const claim = sealClaim({
      ...baseClaim,
      acceptanceStatus: 'SECURITY_QUALIFIED',
      verifierIdentity: 'implementer-agent', // same as implementer
    });
    const result = validateEngineeringClaim(claim, ctx);
    expect(result.valid).toBe(false);
    expect(result.reasons.join(' ')).toContain('self-approved security qualification');
  });

  it('rejects contradictory observations', () => {
    const claim = sealClaim({
      ...baseClaim,
      contradictoryEvidence: ['CI reports 6 Windows compilation errors'],
    });
    const result = validateEngineeringClaim(claim, ctx);
    expect(result.valid).toBe(false);
    expect(result.reasons.join(' ')).toContain('contradictory observations');
  });

  it('accepts a valid claim with independent verifier', () => {
    const claim = sealClaim({
      ...baseClaim,
      acceptanceStatus: 'BEHAVIOR_VERIFIED',
      verifierIdentity: 'independent-verifier',
    });
    const result = validateEngineeringClaim(claim, ctx);
    expect(result.valid).toBe(true);
    expect(result.rejected).toBe(false);
  });
});

describe('D3 — Acceptance state machine', () => {
  it('rejects self-approved SECURITY_QUALIFIED transition', () => {
    const result = canQualifySecurity({
      submitterIdentity: 'implementer-agent',
      implementerIdentity: 'implementer-agent',
      currentStatus: 'BEHAVIOR_VERIFIED',
      evidenceProvided: true,
      runtimeVerified: true,
      isIntegrationTest: true,
      featureEnabled: true,
      compilationFeature: 'windows-ipc',
      targetFeature: 'windows-ipc',
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('self-approved security qualification');
  });

  it('allows SECURITY_QUALIFIED when submitted by independent verifier', () => {
    const result = canQualifySecurity({
      submitterIdentity: 'independent-verifier',
      implementerIdentity: 'implementer-agent',
      currentStatus: 'BEHAVIOR_VERIFIED',
      evidenceProvided: true,
      runtimeVerified: true,
      isIntegrationTest: true,
      featureEnabled: true,
      compilationFeature: 'windows-ipc',
      targetFeature: 'windows-ipc',
    });
    expect(result.allowed).toBe(true);
    expect(result.nextStatus).toBe('SECURITY_QUALIFIED');
  });

  it('rejects source inspection without runtime verification for BEHAVIOR_VERIFIED', () => {
    const result = canTransition({
      currentStatus: 'COMPILED',
      requestedStatus: 'BEHAVIOR_VERIFIED',
      submitterIdentity: 'independent-verifier',
      implementerIdentity: 'implementer-agent',
      evidenceProvided: true,
      runtimeVerified: false,
      isIntegrationTest: true,
      featureEnabled: true,
      compilationFeature: 'windows-ipc',
      targetFeature: 'windows-ipc',
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('runtime verification required');
  });

  it('rejects helper test as substitute for integration test', () => {
    const result = canTransition({
      currentStatus: 'COMPILED',
      requestedStatus: 'BEHAVIOR_VERIFIED',
      submitterIdentity: 'independent-verifier',
      implementerIdentity: 'implementer-agent',
      evidenceProvided: true,
      runtimeVerified: true,
      isIntegrationTest: false,
      featureEnabled: true,
      compilationFeature: 'windows-ipc',
      targetFeature: 'windows-ipc',
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('integration test required');
  });

  it('rejects feature-disabled compilation qualifying feature-enabled path', () => {
    const result = canTransition({
      currentStatus: 'IMPLEMENTED',
      requestedStatus: 'COMPILED',
      submitterIdentity: 'independent-verifier',
      implementerIdentity: 'implementer-agent',
      evidenceProvided: true,
      runtimeVerified: false,
      isIntegrationTest: false,
      featureEnabled: false,
      compilationFeature: null,
      targetFeature: 'windows-ipc',
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('feature-disabled compilation cannot qualify');
  });

  it('allows forward transition chain DOCUMENTED → SOURCE_OBSERVED → IMPLEMENTED', () => {
    let r = canTransition({
      currentStatus: 'DOCUMENTED',
      requestedStatus: 'SOURCE_OBSERVED',
      submitterIdentity: 'independent-verifier',
      implementerIdentity: 'implementer-agent',
      evidenceProvided: true,
      runtimeVerified: false,
      isIntegrationTest: false,
      featureEnabled: false,
      compilationFeature: null,
      targetFeature: null,
    });
    expect(r.allowed).toBe(true);

    r = canTransition({
      currentStatus: 'SOURCE_OBSERVED',
      requestedStatus: 'IMPLEMENTED',
      submitterIdentity: 'independent-verifier',
      implementerIdentity: 'implementer-agent',
      evidenceProvided: true,
      runtimeVerified: false,
      isIntegrationTest: false,
      featureEnabled: false,
      compilationFeature: null,
      targetFeature: null,
    });
    expect(r.allowed).toBe(true);

    r = canTransition({
      currentStatus: 'IMPLEMENTED',
      requestedStatus: 'COMPILED',
      submitterIdentity: 'independent-verifier',
      implementerIdentity: 'implementer-agent',
      evidenceProvided: true,
      runtimeVerified: false,
      isIntegrationTest: false,
      featureEnabled: true,
      compilationFeature: 'windows-ipc',
      targetFeature: 'windows-ipc',
    });
    expect(r.allowed).toBe(true);
  });
});

describe('D4 — Synthetic regression fixtures (false completion claims)', () => {
  // Fixture 1: Authorization function that always returns true.
  it('rejects authorization function that always returns true', () => {
    const claim = sealClaim({
      ...baseClaim,
      targetIdentity: 'Remote MCP tool authorization',
      sourcePath: 'packages/lattice-mcp-remote/src/auth.ts',
      enforcementPath: 'checkToolPermission always returns true',
      securityInvariant: 'tool-specific authorization',
      testIdentity: 'test_helper_passes', // not a security test
      verificationEnvironment: 'macOS cargo',
      verifierIdentity: 'implementer-agent', // self-approving
      acceptanceStatus: 'SECURITY_QUALIFIED',
      contradictoryEvidence: ['checkToolPermission returns true regardless of caller permissions'],
    });
    const result = validateEngineeringClaim(claim, ctx);
    expect(result.valid).toBe(false);
    expect(result.rejected).toBe(true);
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  // Fixture 2: Session ownership check omitted.
  it('rejects session ownership check omitted', () => {
    const claim = sealClaim({
      ...baseClaim,
      targetIdentity: 'MCP session ownership',
      sourcePath: 'packages/lattice-mcp-remote/src/auth.ts',
      enforcementPath: 'session lookup returns stored context without principal check',
      securityInvariant: 'session ownership enforcement',
      testIdentity: 'test_session_exists', // helper test, not ownership test
      verificationEnvironment: 'macOS cargo',
      verifierIdentity: 'independent-verifier',
      acceptanceStatus: 'BEHAVIOR_VERIFIED',
      contradictoryEvidence: ['existing session returned without verifying principal ownership'],
    });
    const result = validateEngineeringClaim(claim, ctx);
    expect(result.valid).toBe(false);
    expect(result.reasons.join(' ')).toContain('contradictory observations');
    expect(result.reasons.join(' ')).toContain('unaccepted verification environment');
  });

  // Fixture 3: Missing dependency lockfile update.
  it('rejects missing dependency lockfile update', () => {
    const claim = sealClaim({
      ...baseClaim,
      targetIdentity: '@clerk/nextjs dependency',
      sourcePath: 'packages/lattice-mcp-remote/package.json',
      enforcementPath: 'package.json declares @clerk/nextjs but root lockfile not updated',
      securityInvariant: 'dependency integrity',
      testIdentity: 'test_package_install',
      verificationEnvironment: 'macOS cargo',
      verifierIdentity: 'independent-verifier',
      acceptanceStatus: 'COMPILED',
      contradictoryEvidence: ['pnpm-lock.yaml is not up to date'],
    });
    const result = validateEngineeringClaim(claim, {
      ...ctx,
      requiredSecurityTests: [],
    });
    expect(result.valid).toBe(false);
    expect(result.reasons.join(' ')).toContain('contradictory observations');
  });

  // Fixture 4: Windows-only code tested exclusively on macOS.
  it('rejects Windows-only code tested on macOS only', () => {
    const claim = sealClaim({
      ...baseClaim,
      targetIdentity: 'Windows named-pipe IPC',
      sourcePath: 'src-tauri/lattice-agent-runtime/src/ipc.rs',
      verificationEnvironment: 'macOS cargo', // wrong environment for Windows code
      verifierIdentity: 'independent-verifier',
      acceptanceStatus: 'BEHAVIOR_VERIFIED',
    });
    const result = validateEngineeringClaim(claim, ctx);
    expect(result.valid).toBe(false);
    expect(result.reasons.join(' ')).toContain('unaccepted verification environment');
  });

  // Fixture 5: Authentication helper present but not invoked correctly.
  it('rejects authentication helper present but not invoked', () => {
    const claim = sealClaim({
      ...baseClaim,
      targetIdentity: 'MCP authentication middleware',
      sourcePath: 'packages/lattice-mcp-remote/src/server.ts',
      enforcementPath: 'authenticateRequest imported but not called in handleRequest',
      securityInvariant: 'fail-closed authentication before initialization',
      testIdentity: 'test_middleware_exists', // existence test, not invocation test
      verificationEnvironment: 'macOS cargo',
      verifierIdentity: 'independent-verifier',
      acceptanceStatus: 'BEHAVIOR_VERIFIED',
      contradictoryEvidence: ['handleRequest does not call authenticateRequest before transport'],
    });
    const result = validateEngineeringClaim(claim, ctx);
    expect(result.valid).toBe(false);
    expect(result.reasons.join(' ')).toContain('contradictory observations');
  });

  // Fixture 6: Passing tests from an outdated commit.
  it('rejects passing tests from an outdated commit', () => {
    const claim = sealClaim({
      ...baseClaim,
      commitSha: 'oldcommit123', // not the candidate commit
      testIdentity: 'test_security_replay_rejected',
      verificationEnvironment: 'Windows CI MSVC',
      verifierIdentity: 'independent-verifier',
      acceptanceStatus: 'BEHAVIOR_VERIFIED',
    });
    const result = validateEngineeringClaim(claim, ctx);
    expect(result.valid).toBe(false);
    expect(result.reasons.join(' ')).toContain('commit mismatch');
  });

  // Fixture 7: Security qualification submitted by the implementing agent.
  it('rejects security qualification by implementing agent', () => {
    const claim = sealClaim({
      ...baseClaim,
      acceptanceStatus: 'SECURITY_QUALIFIED',
      verifierIdentity: 'implementer-agent', // same as implementer
    });
    const result = validateEngineeringClaim(claim, ctx);
    expect(result.valid).toBe(false);
    expect(result.reasons.join(' ')).toContain('self-approved security qualification');
  });

  // Fixture 8: A passing helper test cannot substitute for security qualification.
  it('rejects helper test as security qualification', () => {
    const claim = sealClaim({
      ...baseClaim,
      acceptanceStatus: 'SECURITY_QUALIFIED',
      testIdentity: 'test_helper_passes', // not in requiredSecurityTests
      verifierIdentity: 'independent-verifier',
    });
    const result = validateEngineeringClaim(claim, ctx);
    expect(result.valid).toBe(false);
    expect(result.reasons.join(' ')).toContain('security qualification requires at least one required security test');
  });
});
