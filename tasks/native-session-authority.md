# Native session authority

**Status**: Implemented; platform verification and PR review in progress

**Goal**: Bind the desktop daemon to native-owned local authority before reporting readiness.

## Overview

Why: a valid launch credential must not turn an arbitrary model or webview payload into permission to choose an identity, install grants or invoke legacy capabilities. S2c.1 builds on #453 and establishes the closed native protocol before S2c.2 adds selected folder grants.

---

## Negotiate and bind authority

Require a compatible local protocol and one fresh Rust-generated authority per daemon generation.

**Requirements**:
- Given native launch, should require the explicit native mode, compatible version/features, an exact binding acknowledgement and a scoped heartbeat before reporting ready.
- Given a new launch or restart, should generate fresh session-local principal, workspace and generation identifiers without accepting company/account claims from JavaScript.
- Given a failed or uncertain binding, should close admission and use lifecycle cleanup without retrying the control mutation.
- Given concurrent binding, should admit one immutable initial authority and reject replacement or noninitial permission revisions.

---

## Deny unreviewed native actions

Keep desktop dispatch separate from standalone compatibility routes.

**Requirements**:
- Given native mode before binding, should expose only authenticated liveness, protocol negotiation, initial binding and shutdown.
- Given a bound data-bearing or session request, should reject missing or mismatched identity, generation and policy/grant revisions.
- Given legacy file, command, memory, ingestion, network or unknown actions, should deny dispatch even with a valid launch credential.
- Given malformed, duplicate, unknown, case-aliased, incomplete or excessively nested native fields, should reject them before side effects.
- Given native startup or heartbeat, should leave the unexposed shared memory database unopened and withhold the global telemetry backlog.
- Given standalone mode, should retain its existing authenticated capability and process-cleanup contracts.

---

## Restrict the webview boundary

Require explicit command permissions and local-surface security policy.

**Requirements**:
- Given the local main webview, should permit only declared lifecycle controls and event subscriptions.
- Given another webview or remote origin, should deny those controls through Tauri's permission resolver as well as runtime guards.
- Given the main view, should provide no generic RPC, identity/grant setter, shell execution, event emission or secret-store permission.
- Given the configured release/development policy, should block injected scripts, foreign frames and unapproved outbound requests in a real browser test.
- Given completion of this slice, should leave data-bearing file IPC and native UI/installer qualification to the following slices.
