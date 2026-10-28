# Native host lifecycle

**Status**: Implemented; verification and PR review in progress
**Goal**: Stop owned work before restarting the desktop's authenticated local service.

## Overview

Why: restarting or closing Lattice must cancel active work, release daemon resources and rotate launch credentials without overlapping service generations. S2b builds on S2a in PR #452; approved file/shell invocation remains S2c.

## Daemon shutdown

Establish a single stop boundary for requests and background work.

**Requirements**:
- Given authenticated shutdown, should reject new work, cancel commands and background jobs, and wait for their cleanup before closing shared resources.
- Given missing or incorrect authentication, should leave the service running.
- Given loss of the native parent's stdin lifeline, should initiate the same graceful shutdown.
- Given a task that cannot finish within the shutdown deadline, should report incomplete cleanup instead of a successful clean exit.

## Restart and application exit

Serialize transitions and keep credentials and process handles native.

**Requirements**:
- Given an explicit restart, should invalidate the old session, confirm clean daemon exit, then launch with a fresh credential.
- Given concurrent lifecycle requests or stale callbacks, should prevent duplicate launches and late readiness.
- Given an unresponsive or crashed daemon, should bound fallback termination and refuse a replacement when cleanup is uncertain.
- Given application exit, should finish bounded cleanup before allowing the desktop event loop to exit.
- Given the local desktop's error state, should offer an explicit restart without exposing generic native operations.

## Verification

Exercise the production lifecycle coordinator through native process adapters.

**Requirements**:
- Given Windows and Linux CI, should verify repeated clean restart, retired-credential rejection, active-command descendant cleanup, parent loss, cancellation races and bounded failure.
- Given completed implementation, should preserve human review, CodeQL and installer qualification gates.
