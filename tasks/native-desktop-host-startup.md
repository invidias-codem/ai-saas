# Native desktop host startup

**Status**: Implemented; combined main integration and required checks in PR #453
**Goal**: Establish an authenticated Rust-owned heartbeat before exposing approved desktop operations.

## Overview

Why: users need the desktop to report a usable local connection only after its own daemon accepts a fresh launch credential. S2a follows the S1 capability boundaries and gives startup failures a bounded, understandable outcome.

## Credential custody and startup

Keep the launch credential and child handle inside the native host.

**Requirements**:
- Given a new launch, should generate a fresh OS-random credential and pass it only through the owned child's environment and native RPC requests.
- Given fragmented, oversized, malformed or invalid-port readiness output, should reject invalid input without exposing child logs to the frontend.
- Given a valid readiness announcement, should authenticate a matching typed status response before reporting ready.
- Given missing authentication or a stalled or exited child, should report a bounded failure and close the owned session.
- Given an installed application directory without write permission, should use the OS user's application data directory for the daemon's working files.

## Heartbeat and shutdown

Expose a local-window heartbeat with safe errors and cancel it when its generation ends.

**Requirements**:
- Given an unapproved window or remote origin, should refuse native heartbeat invocation.
- Given a response with a stale request ID, invalid envelope or excessive size, should fail closed.
- Given app exit or a late child callback, should invalidate in-flight work and prevent the stopped generation from becoming ready.
- Given native startup failure, should show a clear desktop error instead of browser development instructions.

## Qualification and remaining slices

Verify the real Rust-to-Go path independently of GUI packaging.

**Requirements**:
- Given Windows and Linux CI runners, should build this revision's daemon and exercise authenticated native protocol regressions against it.
- Given completion of this slice, should retain human review and leave downloads gated until lifecycle, packaged frontend, profile and installer qualification complete.
- Given the next slice, should add graceful shutdown, explicit restart and active-command cleanup before exposing typed approved file and shell operations.
