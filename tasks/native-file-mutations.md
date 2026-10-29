# Guarded native file mutations

**Status**: In progress

**Goal**: Apply a reviewed local file change once, with trusted target preconditions and owned outcome tracking.

## Overview

Why: an accepted proposal must not authorize a replacement target, replay a write after timeout or abandon a running mutation when its caller disappears. S2c.4 adds the native broker and Go filesystem boundary; enabling privileged desktop UI remains gated on S2c.6 native WebKit/WebView2 qualification.

---

## Authorize and prepare

Require separate native write consent and trusted complete base data.

**Requirements**:
- Given a read-only folder, should require native confirmation of the actual directory before installing writable access at a new revision and invalidating older proposals.
- Given a supported proposal, should bind exact create/write bytes, pinned parent identity and complete overwrite base identity/content to a shared canonical digest.
- Given links, special files, roots, traversal, nested read-only grants or unavailable identities, should refuse mutation.

---

## Dispatch and reconcile

Consume one exact decision and retain ownership through completion.

**Requirements**:
- Given current native acceptance and writable permission, should record the operation ID before any effect and admit one mutation per workspace.
- Given stale, denied, expired, changed, replayed or conflicting work, should leave files unchanged.
- Given lost transport or caller disappearance, should retain the owned task, query the existing ID and never automatically resend a mutation.
- Given cancellation or partial failure, should distinguish an observed terminal result from an unknown outcome without claiming rollback.
- Given pending or attempt capacity, should fail closed without evicting generation-long replay records.

---

## Preserve desktop qualification

Keep privileged UI unavailable until actual native UI verification.

**Requirements**:
- Given this slice, should expose no Tauri write-consent, mutation dispatch or generic RPC command to main or review webviews.
- Given native core, real Go daemon, Windows/Linux CI and bundled renderer regressions, should verify successful and refusing paths without counting skipped tests as evidence.
