# Native capability boundaries

**Status**: Implemented; verification and PR review in progress
**Goal**: Close the reproduced native permission and outbound HTTP defects before desktop installation qualification.

## Overview

Why: an authenticated local agent must still respect the user's file grants and upstream credential scope. Slice S1 establishes these boundaries beneath the Windows/Linux Tauri installation work.

## Descriptor-bound file access

Replace path-based operations with pinned, identity-scoped directory capabilities.

**Requirements**:
- Given a path inside a grant that links outside it, should deny access without reading or changing the external file.
- Given a different or missing user/workspace identity, should deny every file and ingestion capability without mutation.
- Given a revoked or replaced grant, should prevent later operations from retaining its authority.
- Given a read-only grant or a request to mutate its root directory, should refuse mutation.
- Given a cross-root move, should report unsupported behavior without a path-based fallback.

## Outbound HTTP and credentials

Constrain native HTTP to explicit product/GitHub origins and separate upstream credentials from local daemon authentication.

**Requirements**:
- Given an unapproved origin, unsafe DNS result, or redirect, should make no request to that destination.
- Given a GitHub request outside the allowed repository/read scope, should deny it before network access.
- Given a daemon launch credential offered for upstream authentication, should reject the request.
- Given a repository clone, should keep credentials out of arguments and the persisted clone URL.

## Qualification and next slice

Integrate the regressions into Windows/Linux CI, then qualify the native desktop bridge separately.

**Requirements**:
- Given the four reported reproductions, should run passing regressions against the actual daemon dispatch path.
- Given Windows without symlink privileges, should exercise an external directory junction rather than silently skip containment verification.
- Given a release proposal, should retain security scan evidence and human review before merge.
- Given completion of S1, should proceed to the Rust-owned authenticated sidecar bridge and packaged desktop frontend proof.
