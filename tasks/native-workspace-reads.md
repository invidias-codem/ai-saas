# Native workspace grants and reads

**Status**: Implemented; platform verification and PR review in progress

**Goal**: Let a desktop user confirm read access to a selected folder, inspect bounded text and revoke access within the native session.

## Overview

Why: selecting a project must establish explicit local authority without giving a webview an arbitrary path, identity or grant setter. S2c.2 builds on S2c.1's closed protocol and preserves the native lifecycle boundary.

---

## Select and install read grants

Keep directory selection and confirmation in native code.

**Requirements**:
- Given a native picker cancellation or denied confirmation, should install no grant.
- Given a selected folder, should display its actual resolved path and requested read access, generate a native grant ID and verify the confirmed directory identity when pinning it in Go.
- Given concurrent selection, restart or changed grants during confirmation, should reject stale selection without restoring old authority.
- Given a complete grant snapshot, should install it atomically at the next revision or block workspace admission after an invalid or uncertain update.

---

## Read through opaque grant handles

Expose only typed list, stat and bounded UTF-8 text reads.

**Requirements**:
- Given a current grant and relative path, should resolve through the pinned directory with default read-only access.
- Given foreign or revoked grants, stale authority, traversal, absolute/drive/UNC/device/stream/URI path forms or a symlink/junction escape, should deny access.
- Given a renamed or replaced root, should retain the pinned directory or deny a changed identity instead of granting its replacement.
- Given a special file, oversized text, invalid UTF-8, excessive directory entries or response size, should return a static bounded error without hanging or silently truncating.
- Given file names and content, should return untrusted text without logging, rendering HTML, ingesting, embedding or making cloud calls.

---

## Revoke and restrict IPC

Close admission before grant changes and retain explicit application-command permissions.

**Requirements**:
- Given revocation, should wait for already admitted reads before acknowledging removal and reject later reads or stale results.
- Given an abandoned IPC caller, should complete an owned permission transition without retrying its control request.
- Given restart, should clear grants and prevent late picker results or file content from crossing generations.
- Given a main local caller, should accept only closed picker/grant-reference/relative-path commands; wrong or remote webviews should have no file authority.
- Given an attempted raw grant, identity, filesystem-plugin, shell or generic RPC invocation, should deny it before side effects.
- Given this slice, should leave file mutation, command execution, production workspace UI and installer qualification to their planned slices.
