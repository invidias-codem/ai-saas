/**
 * Unit tests for src/identity/index.ts
 * Conformance: CONF-001 (node_id DID format)
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import {
  generateKeyPair,
  deriveDID,
  deriveAgentDID,
  initNodeIdentity,
  sign,
  verify,
  type NodeIdentity,
  type KeyPair,
} from '../../src/identity/index.js';

const DID_NODE_PATTERN = /^did:ucol:node:[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const DID_AGENT_PATTERN = /^did:ucol:[1-9A-HJ-NP-Za-km-z]{32,44}$/;

describe('Node Identity', () => {
  let identity: NodeIdentity;
  let kp: KeyPair;

  beforeAll(async () => {
    kp = await generateKeyPair();
    identity = await initNodeIdentity('0.1.0');
  });

  it('generateKeyPair produces 32-byte private and public keys', async () => {
    expect(kp.privateKey).toHaveLength(32);
    expect(kp.publicKey).toHaveLength(32);
  });

  it('deriveDID matches the UCOL node DID pattern', () => {
    const did = deriveDID(kp.publicKey);
    expect(did).toMatch(DID_NODE_PATTERN);
  });

  it('deriveAgentDID does not contain "node:" prefix', () => {
    const did = deriveAgentDID(kp.publicKey);
    expect(did).toMatch(DID_AGENT_PATTERN);
    expect(did).not.toContain('node:');
  });

  it('initNodeIdentity returns a NodeIdentity with nodeId and keys', async () => {
    expect(identity.nodeId).toMatch(DID_NODE_PATTERN);
    expect(identity.privateKey).toHaveLength(32);
    expect(identity.publicKey).toHaveLength(32);
  });

  it('sign() returns a base64url string (Ed25519 sig)', async () => {
    const data = new TextEncoder().encode('test payload');
    const sig = await sign(data, kp.privateKey);
    expect(sig).toMatch(/^[A-Za-z0-9_-]+=*$/);
    expect(sig.length).toBeGreaterThanOrEqual(86);
  });

  it('verify() returns true for a valid signature', async () => {
    const data = new TextEncoder().encode('hello ucol');
    const sig = await sign(data, kp.privateKey);
    const valid = await verify(sig, data, kp.publicKey);
    expect(valid).toBe(true);
  });

  it('verify() returns false for a tampered payload', async () => {
    const data = new TextEncoder().encode('original');
    const tampered = new TextEncoder().encode('tampered');
    const sig = await sign(data, kp.privateKey);
    const valid = await verify(sig, tampered, kp.publicKey);
    expect(valid).toBe(false);
  });

  it('two generated identities have different nodeIds', async () => {
    const id2 = await initNodeIdentity('0.1.0');
    expect(identity.nodeId).not.toBe(id2.nodeId);
  });
});
