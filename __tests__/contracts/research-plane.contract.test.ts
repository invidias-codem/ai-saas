// Research Plane — R0.1 contract tests (security-hardened).
//
// Covers: state machine transitions, freeze-spec idempotency, candidate
// proposal, verification receipt binding, tenant isolation, provenance chain
// integrity, evidence manifest binding, verification policy, negative and
// tamper-detection tests, recursive canonical hashing, verifier
// authorization, content digest validation.
//
// Pure: no Supabase, no network, no external credentials.

import {
  ResearchPlaneError,
  sha256Json,
  sha256Bytes,
  canonicalizeJson,
  verifyContentDigest,
  verifySpecDigest,
  artifactContentHash,
  isValidTransition,
  requireValidTransition,
  sameTenantScope,
  requireTenantAccess,
  canWriteResearch,
  ENABLE_RESEARCH_PLANE,
  type ResearchSpecification,
  type ResearchRun,
  type CandidateArtifact,
  type VerificationReceipt,
  type VerifierIdentity,
  type VerificationPolicy,
  type FrozenSpecInput,
} from '@/lib/research/contracts';
import {
  createRun,
  freezeSpec,
  proposeCandidate,
  submitVerification,
  transitionToStatus,
  validateReceiptBinding,
} from '@/lib/research/lifecycle';
import {
  makeProvenanceEvent,
  buildEvidenceManifest,
  sealEvidenceManifest,
  validateManifestBinding,
  verifyProvenanceChain,
  fileDigest,
} from '@/lib/research/evidence';
import {
  appendProvenanceEvent,
  verifyProvenanceLog,
} from '@/lib/research/provenance';
import {
  VerificationResult,
  buildReceipt,
  assertVerifierIndependence,
  DEFAULT_VERIFICATION_POLICY,
  type VerifierProvider,
} from '@/lib/research/verification/contracts';
import {
  isAxiomAuthorized,
  allRequiredChecksPassed,
  determineOutcome,
  detectArtifactTampering,
  validateReceiptConsistency,
} from '@/lib/research/verification/policy';

const callerScope = { tenantId: 'user:user-1', workspaceId: 'ws-1' };

const makeRun = (overrides: Partial<ResearchRun> = {}): ResearchRun => ({
  runId: 'run-1',
  ownerUserId: 'user-1',
  workspaceId: 'ws-1',
  tenantScope: callerScope,
  status: 'CREATED',
  specVersion: 0,
  specHash: null,
  candidateHash: null,
  verificationReceiptId: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

const makeSpec = (): ResearchSpecification => ({
  problemStatement: 'Sum of first n odd integers equals n squared.',
  researchObjective: 'Prove the theorem formally in Lean.',
  acceptanceCriteria: ['Lean proof compiles', 'Kernel accepts proof'],
  allowedTools: ['lean'],
  executionBudget: {
    maxSteps: 50,
    maxWallClockMs: 300_000,
    maxExternalSpendCents: 0,
  },
  privacyAndPublication: { private: true, allowPublication: false, requireHumanApproval: true },
  requiredVerificationMethods: ['lean_kernel'],
});

const frozenSpecInput = (run: ResearchRun): FrozenSpecInput => ({
  version: 1,
  hash: sha256Json(makeSpec()),
  spec: makeSpec(),
  frozenAt: '2026-01-01T01:00:00Z',
  frozenBy: 'user-1',
});

const makeVerifierProvider = (overrides: Partial<VerifierProvider> = {}): VerifierProvider => ({
  identity: { name: 'lean-kernel', version: '4.10.0', type: 'lean' },
  policy: DEFAULT_VERIFICATION_POLICY,
  verify: jest.fn(),
  ...overrides,
});

describe('research plane — feature flag', () => {
  it('ENABLE_RESEARCH_PLANE defaults to false', () => {
    expect(ENABLE_RESEARCH_PLANE).toBe(false);
  });
});

describe('research plane — state machine transitions', () => {
  it('allows valid transitions only', () => {
    expect(isValidTransition('CREATED', 'SPEC_FROZEN')).toBe(true);
    expect(isValidTransition('SPEC_FROZEN', 'RESEARCHING')).toBe(true);
    expect(isValidTransition('RESEARCHING', 'CANDIDATE_READY')).toBe(true);
    expect(isValidTransition('CANDIDATE_READY', 'VERIFICATION_PENDING')).toBe(true);
    expect(isValidTransition('VERIFICATION_PENDING', 'VERIFIED')).toBe(true);
    expect(isValidTransition('VERIFIED', 'RESEARCHING')).toBe(false); // terminal
    expect(isValidTransition('FAILED', 'VERIFIED')).toBe(false); // terminal
  });

  it('requireValidTransition throws ResearchPlaneError on invalid transition', () => {
    expect(() => requireValidTransition('CREATED', 'RESEARCHING')).toThrow(
      ResearchPlaneError,
    );
    try {
      requireValidTransition('CREATED', 'RESEARCHING');
    } catch (e) {
      expect((e as ResearchPlaneError).code).toBe('INVALID_TRANSITION');
    }
  });

  it('requireValidTransition does not throw on valid transition', () => {
    expect(() => requireValidTransition('CREATED', 'SPEC_FROZEN')).not.toThrow();
  });
});

describe('research plane — create and freeze spec', () => {
  it('createRun produces CREATED run with null spec/candidate hashes', () => {
    const run = createRun(callerScope, {
      runId: 'run-1',
      ownerUserId: 'user-1',
      workspaceId: 'ws-1',
      tenantScope: callerScope,
      createdAt: '2026-01-01T00:00:00Z',
    });
    expect(run.status).toBe('CREATED');
    expect(run.specHash).toBeNull();
    expect(run.candidateHash).toBeNull();
  });

  it('createRun rejects tenant mismatch', () => {
    expect(() =>
      createRun(
        { tenantId: 'user:other', workspaceId: 'ws-1' },
        {
          runId: 'run-1',
          ownerUserId: 'user-1',
          workspaceId: 'ws-1',
          tenantScope: callerScope,
          createdAt: '2026-01-01T00:00:00Z',
        },
      ),
    ).toThrow(ResearchPlaneError);
  });

  it('freezeSpec transitions CREATED -> SPEC_FROZEN and sets specHash', () => {
    const run = makeRun();
    const input = frozenSpecInput(run);
    const result = freezeSpec(callerScope, run, input);
    expect(result.run.status).toBe('SPEC_FROZEN');
    expect(result.run.specVersion).toBe(1);
    expect(result.run.specHash).toBe(input.hash);
    expect(result.specHash).toBe(input.hash);
  });

  it('freezeSpec recomputes spec digest and rejects mismatched caller hash', () => {
    const run = makeRun();
    const spec = makeSpec();
    const actualHash = sha256Json(spec);
    const input: FrozenSpecInput = {
      version: 1,
      hash: 'wrong-hash',
      spec,
      frozenAt: '2026-01-01T01:00:00Z',
      frozenBy: 'user-1',
    };
    expect(() => freezeSpec(callerScope, run, input)).toThrow(
      ResearchPlaneError,
    );
    try {
      freezeSpec(callerScope, run, input);
    } catch (e) {
      expect((e as ResearchPlaneError).code).toBe('VERIFICATION_BIND_MISMATCH');
    }
  });

  it('freezeSpec accepts matching recomputed digest', () => {
    const run = makeRun();
    const spec = makeSpec();
    const actualHash = sha256Json(spec);
    const input: FrozenSpecInput = {
      version: 1,
      hash: actualHash,
      spec,
      frozenAt: '2026-01-01T01:00:00Z',
      frozenBy: 'user-1',
    };
    const result = freezeSpec(callerScope, run, input);
    expect(result.run.status).toBe('SPEC_FROZEN');
    expect(result.run.specHash).toBe(actualHash);
  });

  it('freezeSpec is idempotent on same version+hash', () => {
    const run = makeRun();
    const input = frozenSpecInput(run);
    const first = freezeSpec(callerScope, run, input);
    const second = freezeSpec(callerScope, first.run, input);
    expect(second.run.specVersion).toBe(1);
    expect(second.run.specHash).toBe(input.hash);
  });

  it('freezeSpec rejects transition from non-CREATED status', () => {
    const frozen = makeRun({ status: 'SPEC_FROZEN', specVersion: 1, specHash: 'abc' });
    const input = frozenSpecInput(frozen);
    expect(() => freezeSpec(callerScope, frozen, input)).toThrow(
      ResearchPlaneError,
    );
  });

  it('freezeSpec rejects tenant mismatch', () => {
    const run = makeRun();
    const input = frozenSpecInput(run);
    expect(() =>
      freezeSpec(
        { tenantId: 'user:other', workspaceId: 'ws-1' },
        run,
        input,
      ),
    ).toThrow(ResearchPlaneError);
  });
});

describe('research plane — candidate proposal', () => {
  it('proposeCandidate seals the artifact and sets candidateHash', () => {
    const run = makeRun({ status: 'RESEARCHING' });
    const artifactInput = {
      type: 'proof' as const,
      contentHash: 'abc123',
      contentSize: 1024,
      references: [],
      dependencyHashes: {},
    };
    const result = proposeCandidate(callerScope, run, {
      artifact: artifactInput,
      artifactId: 'art-1',
      createdAt: '2026-01-01T02:00:00Z',
      createdBy: 'explorer@lean-4',
    });
    expect(result.run.status).toBe('CANDIDATE_READY');
    expect(result.run.candidateHash).toBe('abc123');
    expect(result.artifact.sealed).toBe(true);
    expect(result.artifact.artifactId).toBe('art-1');
  });

  it('proposeCandidate rejects from non-RESEARCHING status', () => {
    const run = makeRun({ status: 'CREATED' });
    expect(() =>
      proposeCandidate(callerScope, run, {
        artifact: { type: 'proof', contentHash: 'x', contentSize: 1, references: [], dependencyHashes: {} },
        artifactId: 'art-1',
        createdAt: '2026-01-01T02:00:00Z',
        createdBy: 'explorer@lean-4',
      }),
    ).toThrow(ResearchPlaneError);
  });

  it('proposeCandidate rejects tenant mismatch', () => {
    const run = makeRun({ status: 'RESEARCHING' });
    expect(() =>
      proposeCandidate(
        { tenantId: 'user:other', workspaceId: 'ws-1' },
        run,
        {
          artifact: { type: 'proof', contentHash: 'x', contentSize: 1, references: [], dependencyHashes: {} },
          artifactId: 'art-1',
          createdAt: '2026-01-01T02:00:00Z',
          createdBy: 'explorer@lean-4',
        },
      ),
    ).toThrow(ResearchPlaneError);
  });
});

describe('research plane — verification receipt binding', () => {
  it('submitVerification binds specHash and candidateHash to run', () => {
    const specHash = sha256Json(makeSpec());
    const candidateHash = sha256Bytes('proof content');
    const run = makeRun({
      status: 'VERIFICATION_PENDING',
      specVersion: 1,
      specHash,
      candidateHash,
    });
    const provider = makeVerifierProvider();
    const receiptInput = {
      receipt: {
        outcome: 'VERIFIED' as const,
        checkResults: {
          compilation: { passed: true },
          kernel_acceptance: { passed: true },
          axiom_inspection: { passed: true },
          replay: { passed: true },
        },
        command: 'lean check Solution.lean',
        exitStatus: 0,
        specHash,
        candidateHash,
        toolchain: { name: 'lean', version: '4.10.0', type: 'lean' },
        policy: DEFAULT_VERIFICATION_POLICY,
      },
      receiptId: 'receipt-1',
      executedAt: '2026-01-01T03:00:00Z',
      executedBy: 'verifier@lean-kernel',
      producerRole: 'explorer',
      verifierProvider: provider,
    };
    const result = submitVerification(callerScope, run, receiptInput);
    expect(result.run.status).toBe('VERIFIED');
    expect(result.run.verificationReceiptId).toBe('receipt-1');
    expect(result.receipt.specHash).toBe(specHash);
    expect(result.receipt.candidateHash).toBe(candidateHash);
    expect(result.receipt.sealed).toBe(true);
  });

  it('submitVerification rejects forged VERIFIED receipt with failing checks', () => {
    const specHash = sha256Json(makeSpec());
    const candidateHash = sha256Bytes('proof content');
    const run = makeRun({
      status: 'VERIFICATION_PENDING',
      specVersion: 1,
      specHash,
      candidateHash,
    });
    const provider = makeVerifierProvider();
    expect(() =>
      submitVerification(callerScope, run, {
        receipt: {
          outcome: 'VERIFIED',
          checkResults: { kernel_acceptance: { passed: false } },
          command: 'lean check Solution.lean',
          exitStatus: 0,
          specHash,
          candidateHash,
          toolchain: { name: 'lean', version: '4.10.0', type: 'lean' },
          policy: DEFAULT_VERIFICATION_POLICY,
        },
        receiptId: 'receipt-1',
        executedAt: '2026-01-01T03:00:00Z',
        executedBy: 'verifier@lean-kernel',
        producerRole: 'explorer',
      verifierProvider: provider,
      }),
    ).toThrow(ResearchPlaneError);
  });

  it('submitVerification rejects agent-as-verifier', () => {
    const specHash = sha256Json(makeSpec());
    const candidateHash = sha256Bytes('proof content');
    const run = makeRun({
      status: 'VERIFICATION_PENDING',
      specVersion: 1,
      specHash,
      candidateHash,
    });
    const agentProvider = makeVerifierProvider({
      identity: { name: 'agent', version: '1', type: 'lean' },
    });
    expect(() =>
      submitVerification(callerScope, run, {
        receipt: {
          outcome: 'VERIFIED',
          checkResults: { kernel_acceptance: { passed: true } },
          command: 'lean check Solution.lean',
          exitStatus: 0,
          specHash,
          candidateHash,
          toolchain: { name: 'agent', version: '1', type: 'lean' },
          policy: DEFAULT_VERIFICATION_POLICY,
        },
        receiptId: 'receipt-1',
        executedAt: '2026-01-01T03:00:00Z',
        executedBy: 'explorer@lean-4',
        verifierProvider: agentProvider,
      }),
    ).toThrow(ResearchPlaneError);
  });

  it('submitVerification rejects specHash mismatch', () => {
    const run = makeRun({
      status: 'VERIFICATION_PENDING',
      specVersion: 1,
      specHash: 'expected-hash',
      candidateHash: 'candidate-hash',
    });
    const provider = makeVerifierProvider();
    expect(() =>
      submitVerification(callerScope, run, {
        receipt: {
          outcome: 'VERIFIED',
          checkResults: {},
          command: 'lean check Solution.lean',
          exitStatus: 0,
          toolchain: { name: 'lean', version: '4.10.0', type: 'lean' },
          policy: DEFAULT_VERIFICATION_POLICY,
        },
        receiptId: 'receipt-1',
        executedAt: '2026-01-01T03:00:00Z',
        executedBy: 'verifier@lean-kernel',
        producerRole: 'explorer',
      verifierProvider: provider,
      }),
    ).toThrow(ResearchPlaneError);
  });

  it('submitVerification rejects tenant mismatch', () => {
    const specHash = sha256Json(makeSpec());
    const candidateHash = sha256Bytes('proof content');
    const run = makeRun({
      status: 'VERIFICATION_PENDING',
      specVersion: 1,
      specHash,
      candidateHash,
    });
    const provider = makeVerifierProvider();
    expect(() =>
      submitVerification(
        { tenantId: 'user:other', workspaceId: 'ws-1' },
        run,
        {
          receipt: {
            outcome: 'VERIFIED',
            checkResults: { kernel_acceptance: { passed: true } },
            command: 'lean check Solution.lean',
            exitStatus: 0,
            specHash,
            candidateHash,
            toolchain: { name: 'lean', version: '4.10.0', type: 'lean' },
            policy: DEFAULT_VERIFICATION_POLICY,
          },
          receiptId: 'receipt-1',
          executedAt: '2026-01-01T03:00:00Z',
          executedBy: 'verifier@lean-kernel',
          producerRole: 'explorer',
      verifierProvider: provider,
        },
      ),
    ).toThrow(ResearchPlaneError);
  });

  it('validateReceiptBinding throws on hash mismatch', () => {
    const run = makeRun({ specHash: 'spec-hash', candidateHash: 'cand-hash' });
    const receipt: VerificationReceipt = {
      receiptId: 'r',
      runId: 'run-1',
      specHash: 'wrong-spec',
      candidateHash: 'cand-hash',
      toolchainIdentity: { name: 'lean', version: '4.10.0', type: 'lean' },
      policy: DEFAULT_VERIFICATION_POLICY,
      outcome: 'VERIFIED',
      checkResults: {},
      command: 'lean',
      exitStatus: 0,
      executedAt: '2026-01-01T03:00:00Z',
      executedBy: 'verifier',
      sealed: true,
    };
    expect(() => validateReceiptBinding(run, receipt)).toThrow(
      ResearchPlaneError,
    );
  });
});

describe('research plane — tenant isolation', () => {
  it('sameTenantScope returns true for matching scopes', () => {
    const a = { tenantId: 'user:u1', workspaceId: 'ws1' };
    const b = { tenantId: 'user:u1', workspaceId: 'ws1' };
    expect(sameTenantScope(a, b)).toBe(true);
  });

  it('sameTenantScope returns false for different tenants', () => {
    expect(
      sameTenantScope(
        { tenantId: 'user:u1', workspaceId: 'ws1' },
        { tenantId: 'user:u2', workspaceId: 'ws1' },
      ),
    ).toBe(false);
  });

  it('sameTenantScope returns true when both null', () => {
    expect(sameTenantScope(null, null)).toBe(true);
  });

  it('requireTenantAccess throws on mismatch', () => {
    expect(() =>
      requireTenantAccess(
        { tenantId: 'user:u1', workspaceId: 'ws1' },
        { tenantId: 'user:u2', workspaceId: 'ws1' },
      ),
    ).toThrow(ResearchPlaneError);
  });

  it('canWriteResearch allows owner/admin/member, denies viewer/null', () => {
    expect(canWriteResearch('owner')).toBe(true);
    expect(canWriteResearch('admin')).toBe(true);
    expect(canWriteResearch('member')).toBe(true);
    expect(canWriteResearch('viewer')).toBe(false);
    expect(canWriteResearch(null)).toBe(false);
  });
});

describe('research plane — provenance chain', () => {
  it('makeProvenanceEvent computes contentHash and chains previousHash', () => {
    const event = makeProvenanceEvent({
      eventId: 'e-1',
      runId: 'run-1',
      seq: 0,
      eventType: 'run_created',
      actor: 'user-1',
      actorRole: 'human',
      timestamp: '2026-01-01T00:00:00Z',
      previousHash: null,
      metadata: {},
    });
    expect(event.contentHash).toBeDefined();
    expect(event.previousHash).toBeNull();
    expect(event.seq).toBe(0);
    expect(event.runId).toBe('run-1');
  });

  it('verifyProvenanceChain accepts valid chain', () => {
    const e1 = makeProvenanceEvent({
      eventId: 'e-1', runId: 'run-1', seq: 0, eventType: 'run_created',
      actor: 'user-1', actorRole: 'human', timestamp: 't0', previousHash: null, metadata: {},
    });
    const e2 = makeProvenanceEvent({
      eventId: 'e-2', runId: 'run-1', seq: 1, eventType: 'spec_frozen',
      actor: 'user-1', actorRole: 'human', timestamp: 't1', previousHash: e1.contentHash, metadata: {},
    });
    const result = verifyProvenanceChain([e1, e2]);
    expect(result.valid).toBe(true);
  });

  it('verifyProvenanceChain rejects broken chain link', () => {
    const e1 = makeProvenanceEvent({
      eventId: 'e-1', runId: 'run-1', seq: 0, eventType: 'run_created',
      actor: 'user-1', actorRole: 'human', timestamp: 't0', previousHash: null, metadata: {},
    });
    const e2 = makeProvenanceEvent({
      eventId: 'e-2', runId: 'run-1', seq: 1, eventType: 'spec_frozen',
      actor: 'user-1', actorRole: 'human', timestamp: 't1', previousHash: 'tampered', metadata: {},
    });
    const result = verifyProvenanceChain([e1, e2]);
    expect(result.valid).toBe(false);
    expect(result.failure!.reason).toBe('chain link broken');
  });

  it('verifyProvenanceChain rejects tampered content hash', () => {
    const e1 = makeProvenanceEvent({
      eventId: 'e-1', runId: 'run-1', seq: 0, eventType: 'run_created',
      actor: 'user-1', actorRole: 'human', timestamp: 't0', previousHash: null, metadata: {},
    });
    const tampered = { ...e1, contentHash: 'tampered-hash' };
    const result = verifyProvenanceChain([tampered]);
    expect(result.valid).toBe(false);
    expect(result.failure!.reason).toBe('content hash mismatch');
  });

  it('verifyProvenanceChain rejects run ID mismatch', () => {
    const e1 = makeProvenanceEvent({
      eventId: 'e-1', runId: 'run-1', seq: 0, eventType: 'run_created',
      actor: 'user-1', actorRole: 'human', timestamp: 't0', previousHash: null, metadata: {},
    });
    const e2 = makeProvenanceEvent({
      eventId: 'e-2', runId: 'run-2', seq: 1, eventType: 'spec_frozen',
      actor: 'user-1', actorRole: 'human', timestamp: 't1', previousHash: e1.contentHash, metadata: {},
    });
    const result = verifyProvenanceChain([e1, e2]);
    expect(result.valid).toBe(false);
    expect(result.failure!.reason).toBe('run ID mismatch');
  });

  it('verifyProvenanceChain rejects sequence gap', () => {
    const e1 = makeProvenanceEvent({
      eventId: 'e-1', runId: 'run-1', seq: 0, eventType: 'run_created',
      actor: 'user-1', actorRole: 'human', timestamp: 't0', previousHash: null, metadata: {},
    });
    const e2 = makeProvenanceEvent({
      eventId: 'e-2', runId: 'run-1', seq: 5, eventType: 'spec_frozen',
      actor: 'user-1', actorRole: 'human', timestamp: 't1', previousHash: e1.contentHash, metadata: {},
    });
    const result = verifyProvenanceChain([e1, e2]);
    expect(result.valid).toBe(false);
    expect(result.failure!.reason).toBe('sequence gap or duplicate');
  });

  it('appendProvenanceEvent rejects invalid existing chain', () => {
    const badEvent = makeProvenanceEvent({
      eventId: 'e-1', runId: 'run-1', seq: 0, eventType: 'run_created',
      actor: 'user-1', actorRole: 'human', timestamp: 't0', previousHash: null, metadata: {},
    });
    const tampered = { ...badEvent, contentHash: 'tampered' };
    expect(() =>
      appendProvenanceEvent({
        existingLog: [tampered],
        eventId: 'e-2',
        runId: 'run-1',
        eventType: 'spec_frozen',
        actor: 'user-1',
        actorRole: 'human',
        timestamp: 't1',
        metadata: {},
      }),
    ).toThrow();
  });

  it('appendProvenanceEvent rejects run ID mismatch', () => {
    const existing = [makeProvenanceEvent({
      eventId: 'e-1', runId: 'run-1', seq: 0, eventType: 'run_created',
      actor: 'user-1', actorRole: 'human', timestamp: 't0', previousHash: null, metadata: {},
    })];
    expect(() =>
      appendProvenanceEvent({
        existingLog: existing,
        eventId: 'e-2',
        runId: 'run-2',
        eventType: 'spec_frozen',
        actor: 'user-1',
        actorRole: 'human',
        timestamp: 't1',
        metadata: {},
      }),
    ).toThrow();
  });

  it('verifyProvenanceLog returns last event hash for valid log', () => {
    const e1 = makeProvenanceEvent({
      eventId: 'e-1', runId: 'run-1', seq: 0, eventType: 'run_created',
      actor: 'user-1', actorRole: 'human', timestamp: 't0', previousHash: null, metadata: {},
    });
    const result = verifyProvenanceLog([e1]);
    expect(result.valid).toBe(true);
    expect(result.lastEventHash).toBe(e1.contentHash);
  });
});

describe('research plane — evidence manifest', () => {
  it('buildEvidenceManifest and sealEvidenceManifest work', () => {
    const run = makeRun({ specVersion: 1, specHash: 'spec-hash', candidateHash: 'cand-hash' });
    const manifest = buildEvidenceManifest({
      run,
      artifactIds: ['art-1'],
      receiptId: null,
      eventCount: 2,
      lastEventHash: 'last-hash',
      sha256sums: { 'Solution.lean': 'sha256:abc' },
    });
    expect(manifest.specHash).toBe('spec-hash');
    expect(manifest.candidateHash).toBe('cand-hash');
    expect(manifest.sealedAt).toBeNull();

    const sealed = sealEvidenceManifest(manifest, '2026-01-01T04:00:00Z');
    expect(sealed.sealedAt).toBe('2026-01-01T04:00:00Z');
    expect(manifest.sealedAt).toBeNull(); // original not mutated
  });

  it('validateManifestBinding accepts matching receipt', () => {
    const manifest = buildEvidenceManifest({
      run: makeRun({ specHash: 'spec-hash', candidateHash: 'cand-hash' }),
      artifactIds: [], receiptId: null, eventCount: 0, lastEventHash: null, sha256sums: {},
    });
    const receipt: VerificationReceipt = {
      receiptId: 'r', runId: 'run-1', specHash: 'spec-hash', candidateHash: 'cand-hash',
      toolchainIdentity: { name: 'lean', version: '4.10.0', type: 'lean' },
      policy: DEFAULT_VERIFICATION_POLICY, outcome: 'VERIFIED', checkResults: {},
      command: 'lean', exitStatus: 0, executedAt: 't', executedBy: 'v', sealed: true,
    };
    expect(validateManifestBinding(manifest, receipt).valid).toBe(true);
  });

  it('validateManifestBinding rejects specHash mismatch', () => {
    const manifest = buildEvidenceManifest({
      run: makeRun({ specHash: 'spec-hash', candidateHash: 'cand-hash' }),
      artifactIds: [], receiptId: null, eventCount: 0, lastEventHash: null, sha256sums: {},
    });
    const receipt: VerificationReceipt = {
      receiptId: 'r', runId: 'run-1', specHash: 'wrong', candidateHash: 'cand-hash',
      toolchainIdentity: { name: 'lean', version: '4.10.0', type: 'lean' },
      policy: DEFAULT_VERIFICATION_POLICY, outcome: 'VERIFIED', checkResults: {},
      command: 'lean', exitStatus: 0, executedAt: 't', executedBy: 'v', sealed: true,
    };
    expect(validateManifestBinding(manifest, receipt).valid).toBe(false);
  });
});

describe('research plane — deterministic hashing', () => {
  it('sha256Json is deterministic and order-independent at top level', () => {
    const a = sha256Json({ b: 2, a: 1 });
    const b = sha256Json({ a: 1, b: 2 });
    expect(a).toBe(b);
  });

  it('sha256Json is order-independent at nested levels (recursive canonicalization)', () => {
    const a = sha256Json({ executionBudget: { maxSteps: 50, maxWallClockMs: 300000 } });
    const b = sha256Json({ executionBudget: { maxWallClockMs: 300000, maxSteps: 50 } });
    expect(a).toBe(b);
  });

  it('sha256Json produces different digests for different nested values', () => {
    const a = sha256Json({ executionBudget: { maxSteps: 50 } });
    const b = sha256Json({ executionBudget: { maxSteps: 100 } });
    expect(a).not.toBe(b);
  });

  it('canonicalizeJson sorts keys recursively', () => {
    const a = canonicalizeJson({ z: 1, a: { y: 2, x: 3 } });
    const b = canonicalizeJson({ a: { x: 3, y: 2 }, z: 1 });
    expect(a).toBe(b);
  });

  it('sha256Bytes hashes raw bytes', () => {
    expect(sha256Bytes('hello')).toBe(sha256Bytes(Buffer.from('hello', 'utf8')));
  });

  it('artifactContentHash is deterministic', () => {
    const h1 = artifactContentHash({
      type: 'proof', contentHash: 'x', contentSize: 1, references: [], dependencyHashes: {},
    });
    const h2 = artifactContentHash({
      type: 'proof', contentHash: 'x', contentSize: 1, references: [], dependencyHashes: {},
    });
    expect(h1).toBe(h2);
  });
});

describe('research plane — content digest validation', () => {
  it('verifyContentDigest accepts matching digest', () => {
    const content = 'proof content';
    const hash = sha256Bytes(content);
    const result = verifyContentDigest(hash, content);
    expect(result.valid).toBe(true);
    expect(result.actualHash).toBe(hash);
  });

  it('verifyContentDigest rejects mismatched digest', () => {
    const result = verifyContentDigest('wrong-hash', 'actual content');
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('content digest mismatch');
    expect(result.actualHash).toBeDefined();
  });

  it('verifySpecDigest accepts matching spec digest', () => {
    const spec = makeSpec();
    const hash = sha256Json(spec);
    const result = verifySpecDigest(hash, spec);
    expect(result.valid).toBe(true);
  });

  it('verifySpecDigest rejects mismatched spec digest', () => {
    const spec = makeSpec();
    const result = verifySpecDigest('wrong-hash', spec);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('content digest mismatch');
  });
});

describe('research plane — verification policy', () => {
  it('isAxiomAuthorized rejects disallowed axioms', () => {
    const policy: VerificationPolicy = {
      ...DEFAULT_VERIFICATION_POLICY,
      disallowedAxioms: ['classical.choice'],
    };
    expect(isAxiomAuthorized(policy, 'classical.choice')).toBe(false);
    expect(isAxiomAuthorized(policy, 'classical.emf')).toBe(true);
  });

  it('allRequiredChecksPassed returns false when a required check is missing', () => {
    const policy: VerificationPolicy = {
      ...DEFAULT_VERIFICATION_POLICY,
      requiredChecks: ['compilation', 'kernel_acceptance'],
    };
    expect(allRequiredChecksPassed(policy, { compilation: { passed: true } })).toBe(false);
    expect(
      allRequiredChecksPassed(policy, {
        compilation: { passed: true },
        kernel_acceptance: { passed: true },
      }),
    ).toBe(true);
  });

  it('determineOutcome returns INCONCLUSIVE on timeout', () => {
    expect(
      determineOutcome({
        policy: DEFAULT_VERIFICATION_POLICY,
        checkResults: { compilation: { passed: true } },
        exitStatus: 0,
        disallowedAxiomsUsed: [],
        placeholdersPresent: false,
        timeoutExceeded: true,
      }),
    ).toBe('INCONCLUSIVE');
  });

  it('determineOutcome returns FAILED on disallowed axiom', () => {
    expect(
      determineOutcome({
        policy: DEFAULT_VERIFICATION_POLICY,
        checkResults: { compilation: { passed: true } },
        exitStatus: 0,
        disallowedAxiomsUsed: ['classical.choice'],
        placeholdersPresent: false,
        timeoutExceeded: false,
      }),
    ).toBe('FAILED');
  });

  it('determineOutcome returns FAILED on placeholder', () => {
    expect(
      determineOutcome({
        policy: DEFAULT_VERIFICATION_POLICY,
        checkResults: { compilation: { passed: true } },
        exitStatus: 0,
        disallowedAxiomsUsed: [],
        placeholdersPresent: true,
        timeoutExceeded: false,
      }),
    ).toBe('FAILED');
  });

  it('determineOutcome returns VERIFIED when all checks pass', () => {
    expect(
      determineOutcome({
        policy: DEFAULT_VERIFICATION_POLICY,
        checkResults: {
          compilation: { passed: true },
          kernel_acceptance: { passed: true },
          axiom_inspection: { passed: true },
          replay: { passed: true },
        },
        exitStatus: 0,
        disallowedAxiomsUsed: [],
        placeholdersPresent: false,
        timeoutExceeded: false,
      }),
    ).toBe('VERIFIED');
  });

  it('detectArtifactTampering flags hash mismatch', () => {
    expect(detectArtifactTampering('expected', 'actual').tampered).toBe(true);
    expect(detectArtifactTampering('same', 'same').tampered).toBe(false);
  });

  it('validateReceiptConsistency rejects VERIFIED with failing checks', () => {
    const result = validateReceiptConsistency(
      DEFAULT_VERIFICATION_POLICY,
      'VERIFIED',
      { compilation: { passed: false } },
    );
    expect(result.consistent).toBe(false);
    expect(result.reason).toContain('checks failed');
  });
});

describe('research plane — verifier independence', () => {
  it('assertVerifierIndependence rejects verifier-as-agent', () => {
    const provider = {
      identity: { name: 'agent', version: '1', type: 'lean' },
      policy: DEFAULT_VERIFICATION_POLICY,
    };
    expect(() => assertVerifierIndependence('explorer', provider as any)).toThrow(
      ResearchPlaneError,
    );
    expect(() => assertVerifierIndependence('formalizer', provider as any)).toThrow(
      ResearchPlaneError,
    );
    expect(() => assertVerifierIndependence('critic', provider as any)).toThrow(
      ResearchPlaneError,
    );
    expect(() => assertVerifierIndependence('coordinator', provider as any)).toThrow(
      ResearchPlaneError,
    );
  });

  it('assertVerifierIndependence rejects matching producer/verifier identity', () => {
    const provider = {
      identity: { name: 'explorer', version: '1', type: 'lean' },
      policy: DEFAULT_VERIFICATION_POLICY,
    };
    expect(() => assertVerifierIndependence('explorer', provider as any)).toThrow(
      ResearchPlaneError,
    );
  });

  it('assertVerifierIndependence allows independent verifier', () => {
    const provider = {
      identity: { name: 'lean-kernel', version: '4.10.0', type: 'lean' },
      policy: DEFAULT_VERIFICATION_POLICY,
    };
    expect(() => assertVerifierIndependence('explorer', provider as any)).not.toThrow();
    expect(() => assertVerifierIndependence('formalizer', provider as any)).not.toThrow();
  });

  it('buildReceipt produces sealed receipt bound to hashes', () => {
    const result: VerificationResult = {
      outcome: 'VERIFIED',
      checkResults: { kernel_acceptance: { passed: true } },
      command: 'lean check Solution.lean',
      exitStatus: 0,
      executedAt: '2026-01-01T03:00:00Z',
      executedBy: 'verifier@lean-kernel',
      toolchain: { name: 'lean', version: '4.10.0', type: 'lean' },
      policy: DEFAULT_VERIFICATION_POLICY,
    };
    const receipt = buildReceipt({
      receiptId: 'receipt-1',
      runId: 'run-1',
      specHash: 'spec-hash',
      candidateHash: 'cand-hash',
      result,
    });
    expect(receipt.sealed).toBe(true);
    expect(receipt.specHash).toBe('spec-hash');
    expect(receipt.candidateHash).toBe('cand-hash');
    expect(receipt.outcome).toBe('VERIFIED');
  });
});

describe('research plane — negative / tamper detection', () => {
  it('rejects corrupted proof (candidate hash mismatch)', () => {
    const run = makeRun({
      status: 'VERIFICATION_PENDING',
      specHash: 'spec-hash',
      candidateHash: 'original-hash',
    });
    const provider = makeVerifierProvider();
    expect(() =>
      submitVerification(callerScope, run, {
        receipt: {
          outcome: 'VERIFIED',
          checkResults: {},
          command: 'lean check',
          exitStatus: 0,
          toolchain: { name: 'lean', version: '4.10.0', type: 'lean' },
          policy: DEFAULT_VERIFICATION_POLICY,
        },
        receiptId: 'r',
        executedAt: 't',
        executedBy: 'v',
        producerRole: 'explorer',
      verifierProvider: provider,
      }),
    ).toThrow(ResearchPlaneError);
  });

  it('rejects changed theorem statement (spec hash mismatch)', () => {
    const run = makeRun({
      status: 'VERIFICATION_PENDING',
      specHash: 'original-spec',
      candidateHash: 'cand-hash',
    });
    const provider = makeVerifierProvider();
    expect(() =>
      submitVerification(callerScope, run, {
        receipt: {
          outcome: 'VERIFIED',
          checkResults: {},
          command: 'lean check',
          exitStatus: 0,
          toolchain: { name: 'lean', version: '4.10.0', type: 'lean' },
          policy: DEFAULT_VERIFICATION_POLICY,
        },
        receiptId: 'r',
        executedAt: 't',
        executedBy: 'v',
        producerRole: 'explorer',
      verifierProvider: provider,
      }),
    ).toThrow(ResearchPlaneError);
  });

  it('transitionToStatus is idempotent on same status', () => {
    const run = makeRun({ status: 'FAILED' });
    const result = transitionToStatus(callerScope, run, { status: 'FAILED', at: 't' });
    expect(result).toBe(run);
  });

  it('transitionToStatus rejects invalid terminal transition', () => {
    const run = makeRun({ status: 'VERIFIED' });
    expect(() =>
      transitionToStatus(callerScope, run, { status: 'RESEARCHING', at: 't' }),
    ).toThrow(ResearchPlaneError);
  });

  it('transitionToStatus rejects tenant mismatch', () => {
    const run = makeRun({ status: 'FAILED' });
    expect(() =>
      transitionToStatus(
        { tenantId: 'user:other', workspaceId: 'ws-1' },
        run,
        { status: 'REJECTED', at: 't' },
      ),
    ).toThrow(ResearchPlaneError);
  });

  it('transitionToStatus rejects direct promotion from VERIFICATION_PENDING to VERIFIED', () => {
    const run = makeRun({ status: 'VERIFICATION_PENDING' });
    expect(() =>
      transitionToStatus(callerScope, run, { status: 'VERIFIED', at: 't' }),
    ).toThrow(ResearchPlaneError);
    try {
      transitionToStatus(callerScope, run, { status: 'VERIFIED', at: 't' });
    } catch (e) {
      expect((e as ResearchPlaneError).code).toBe('INVALID_TRANSITION');
    }
  });

  it('transitionToStatus rejects direct promotion from VERIFICATION_PENDING to any terminal state', () => {
    const run = makeRun({ status: 'VERIFICATION_PENDING' });
    for (const terminal of ['FAILED', 'INCONCLUSIVE', 'REJECTED'] as const) {
      expect(() =>
        transitionToStatus(callerScope, run, { status: terminal, at: 't' }),
      ).toThrow(ResearchPlaneError);
    }
  });

  it('transitionToStatus allows non-terminal transitions from VERIFICATION_PENDING', () => {
    // There are no valid non-terminal transitions from VERIFICATION_PENDING,
    // so any transition should be rejected.
    const run = makeRun({ status: 'VERIFICATION_PENDING' });
    expect(() =>
      transitionToStatus(callerScope, run, { status: 'RESEARCHING', at: 't' }),
    ).toThrow(ResearchPlaneError);
  });

  it('submitVerification rejects forged VERIFIED receipt with nonzero exit status', () => {
    const specHash = sha256Json(makeSpec());
    const candidateHash = sha256Bytes('proof content');
    const run = makeRun({
      status: 'VERIFICATION_PENDING',
      specVersion: 1,
      specHash,
      candidateHash,
    });
    const provider = makeVerifierProvider();
    expect(() =>
      submitVerification(callerScope, run, {
        receipt: {
          outcome: 'VERIFIED',
          checkResults: {
            compilation: { passed: true },
            kernel_acceptance: { passed: true },
            axiom_inspection: { passed: true },
            replay: { passed: true },
          },
          command: 'lean check Solution.lean',
          exitStatus: 1,
          specHash,
          candidateHash,
          toolchain: { name: 'lean', version: '4.10.0', type: 'lean' },
          policy: DEFAULT_VERIFICATION_POLICY,
        },
        receiptId: 'receipt-1',
        executedAt: '2026-01-01T03:00:00Z',
        executedBy: 'verifier@lean-kernel',
        producerRole: 'explorer',
        verifierProvider: provider,
      }),
    ).toThrow(ResearchPlaneError);
  });
});
