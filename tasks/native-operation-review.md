# Native exact operation review

**Status**: Implemented; human review pending

**Goal**: Review immutable local operation proposals in an isolated native-created window and retain one-use decisions in the native session.

## Overview

Why: a model or main webview must not turn its own proposed change into an approval. S2c.3 adds a separate bundled review surface and native decision coordinator while retaining S2c.2's read-only permission ceiling.

---

## Bind immutable proposals

Capture exact operation bytes and current native scope before review.

**Requirements**:
- Given a permitted local grant, should prepare a closed file/directory creation proposal with an exclusive-create precondition, exact UTF-8 bytes and native identity/generation/revisions.
- Given malformed, oversized, root-mutating or unsupported write/delete/command proposals, should reject them without filesystem side effects.
- Given a proposal, should generate its native ID and SHA3-256 digest over a versioned canonical encoding shared with Go fixtures.
- Given capacity or expiry, should bound state to 32 pending proposals, one active review, five monotonic minutes and 4,096 consumed IDs without evicting replay protection.

---

## Isolate native review

Show the immutable record through fixed bundled assets and narrowly scoped IPC.

**Requirements**:
- Given a review request, should create one native-owned window instance with a unique label and fixed review origin, independent of the SaaS frontend/development server.
- Given a main, remote, wrong, stale or recreated window, should reject review document access, display acknowledgement and approval decisions.
- Given untrusted paths/content, should render exact text/bytes without HTML execution, truncation, foreign resources, frames, network, opener or generic plugin authority.
- Given incomplete display, navigation, close, expiry or cancellation, should deny review and destroy its window.

---

## Consume decisions safely

Keep approval state in Rust and independent of the SaaS approval store.

**Requirements**:
- Given an accepted exact display, should permit one native consumption only after matching payload, current authority, revisions, expiry and writable permission.
- Given concurrent, changed, denied, expired, revoked, restarted or replayed requests, should reject consumption before dispatch.
- Given an IPC caller disappearing, should retain owned review cleanup without granting authority through a returned proposal ID.
- Given this read-only desktop build, should record review decisions but expose no execution/consumption IPC, write-grant setter or Go mutation route; S2c.4/S2c.5 retain those gates.
