# Native workspace authority and approved operations

**Status**: Planned

**Goal**: Give the native host ownership of local workspace identity, folder grants and exact operation approvals.

## Overview

Why: a desktop user needs to authorize a specific project and change without giving a model or webview the ability to invent identity, grant itself folders or approve its own commands. S2c follows S2b in draft PR #453; its design and acceptance matrix are in [the authority plan](../docs/operations/native-workspace-authority-plan.md).

---

## Bind the native session

Negotiate a versioned protocol and bind one Rust-owned local workspace per daemon generation.

**Requirements**:
- Given native startup, should negotiate compatible features before enabling workspace operations.
- Given untrusted account/workspace claims, should use native local authority or deny company-bound work until enrollment is verified.
- Given native mode before binding or an unexposed legacy/cloud/memory action, should deny data access while retaining lifecycle control.
- Given a workspace switch, should invalidate authority and complete a clean restart before enrolling another workspace.
- Given new application commands, should restrict them through explicit Tauri command permissions, runtime window/origin checks and tested local-surface CSP before enabling data access.

---

## Select and revoke folder grants

Create read-only grants from native selection and expose bounded typed file reads.

**Requirements**:
- Given native folder selection and confirmation, should install a pinned workspace-specific read-only grant without trusting a webview-supplied root or identity.
- Given a read request, should accept only an authorized grant handle and valid relative path through the existing filesystem boundary.
- Given a failed or uncertain grant update, should block workspace admission until authority is re-established.
- Given revocation, should invalidate pending work and wait for admitted operations before acknowledging completion.
- Given restart, should retain no previous grant or approval automatically.

---

## Review immutable proposals

Keep exact requests and one-use decisions in the native core with an independent trusted review surface.

**Requirements**:
- Given a proposed operation, should bind exact effective inputs, authority revisions, native generation and monotonic expiry before showing review.
- Given a main/remote/wrong/stale window, should prevent it from confirming a proposal.
- Given hostile file or script content, should display it as inert text in a bundled review surface with restricted capabilities and CSP.
- Given denial, expiry, review closure, changed inputs or concurrent decisions, should prevent unapproved dispatch.
- Given bounded pending/dispatch state at capacity, should fail closed without evicting live replay protection.

---

## Apply approved file operations

Dispatch one bounded mutation attempt only after consuming its exact native approval.

**Requirements**:
- Given a writable grant and exact approval, should create or write only the reviewed permitted target through the existing Go boundary.
- Given a detected base-file change, revoked grant, stale revision or duplicate operation ID, should reject the attempt without applying the proposed mutation.
- Given delete or move, should require explicit destructive grant elevation and exact approval while denying recursive deletion, root mutation and cross-root moves.
- Given a timeout after dispatch, should preserve an unknown outcome and query the existing attempt rather than retry the mutation automatically.
- Given a process restart, should never reconstruct authorization or re-execute old work from transient operation records.

---

## Gate command execution

Build the typed command broker while requiring a qualified execution provider before process launch.

**Requirements**:
- Given a command proposal, should bind script or argv, shell, resolved executable/cwd, limits, environment policy, authority and provider revisions to the reviewed request.
- Given no qualified isolation provider, should return `LOCAL_SANDBOX_REQUIRED` before launching any direct executable or shell.
- Given an unavailable shell or replaced executable/cwd, should deny execution without installing or substituting another shell.
- Given an authorized provider and a cancelled or closing session, should stop and join owned command work without abandoning tracking or overlapping a replacement.
- Given command logs and diagnostics, should exclude scripts, file contents, arguments, captured output and credentials.

---

## Verify the native boundary

Exercise real-daemon and native UI admission on Windows and Linux before enabling privileged operations.

**Requirements**:
- Given CI, should cover wrong identity, stale revisions, traversal/junctions, changed/replayed approvals, revocation races, unknown outcomes and restart authority reset.
- Given the real daemon with no execution provider, should prove zero process launches through every native command route.
- Given the bundled review fixture, should verify actual capability/window isolation and CSP on both target platforms.
- Given completed core implementation, should reconcile S2a/S2b onto main through human review, obtain CodeQL and leave profiles, installers, signing and downloads to their qualification slices.
