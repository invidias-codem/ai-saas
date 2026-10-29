# Native command admission and qualified providers

**Status**: In progress

**Goal**: Bind exact commands to native review and refuse process launch without a qualified execution provider.

## Overview

Why: a writable folder, an approval or a process group does not confine a command. S2c.5 adds typed command preparation and admission with a qualified-provider requirement while preserving the S2c.6 privileged UI gate.

---

## Prepare exact commands

Resolve effective command options and pin the selected executable and working directory before review.

**Requirements**:
- Given direct execution, should preserve structured executable/argv without string splitting or shell reinterpretation.
- Given CMD, Windows PowerShell, pwsh or sh, should use the explicitly selected supported shell and refuse a missing shell without fallback or installation.
- Given a command proposal, should bind its exact bytes, resolved executable identity/hash, pinned cwd grant/identity, effective 30-second default/120-second cap, 10-KiB output bound and provider/environment policy to a shared canonical digest.
- Given caller environment, raw paths, approvals or sandbox claims, should refuse them before admission.

---

## Require qualified containment

Separate trusted provider qualification from caller claims and process ownership.

**Requirements**:
- Given the production provider registry in this slice, should return LOCAL_SANDBOX_REQUIRED and launch zero processes for every command mode.
- Given an internal test provider, should require current qualification for permitted files/network, non-elevated execution, descendant ownership, current policy, pinned launch identities and a clean environment.
- Given changed authority, cwd, executable, provider revision, payload or expiry, should refuse launch and require a fresh review.

---

## Own attempts and results

Reuse bounded one-use admission across file mutations and commands.

**Requirements**:
- Given exact native acceptance and qualified provider admission, should record one generation-long attempt before effects and serialize it with file mutations.
- Given lost callers or responses, should retain operation ownership and reconcile the existing ID without automatic dispatch retries.
- Given timeout, cancellation or uncertain cleanup, should retain tracking, enforce cleanup requirements and block replacement while cleanup is unconfirmed.
- Given command output, should return bounded untrusted text only to the current permitted scope without logging scripts, argv, output or credentials.
- Given this slice, should keep command execution/output and provider configuration unavailable to main/review Tauri webviews until native UI and provider qualification.
