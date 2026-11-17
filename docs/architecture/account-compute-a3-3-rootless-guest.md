# A3.3 — Rootless Linux guest adapter (draft, NOT qualified)

**Status:** source adapter + mocked contracts only. Do not enable in production.
**Stack:** A3.3 on A3.2.1 (#513), which is on A0–A2.1 (#512).
**Flags:** ENABLE_ACCOUNT_COMPUTE, ENABLE_ACCOUNT_COMPUTE_LIFECYCLE, and
ENABLE_ACCOUNT_COMPUTE_GUEST_RUNTIME must *all* be true for adapter methods.
None of these flags is set by this slice.

## Scope

The experimental Rootless Podman adapter in
lib/intelligence/execution/accountCompute/rootlessPodmanGuest.ts injects:
1. A trusted account VM resolver (server-validated Clerk owner, VM ready,
   provider-verified linux_vm and qualification evidence).
2. A trusted VM command transport (argv array only; no shells; pinned to
   account VM desktop ID and tenant/workspace scope).
3. An immutable image digest and finite CPU, memory, PID, workspace tmpfs limits.

The adapter does not implement the Daytona VM transport and is not wired to the
HTTP route. Its ID deliberately includes "unqualified" until the real staging
gate passes. The existing mock provider stays blocked in the route.

## Defense-in-depth policy (to verify in a real Linux VM)

- Rootless Podman, cgroups v2, and seccomp must be present; no rootful fallback.
- One guest container per owner+workspace-derived namespace; verify ownership
  labels before *all* destructive or state-changing operations.
- No privileged containers, Docker socket, host bind mounts, host networking,
  ambient environment credentials, or published ports.
- A readonly rootfs; separate bounded /workspace and /tmp tmpfs mounts, both
  ephemeral. No persistent workspace volume is supplied or promised yet.
- Restricted user namespace and nonroot guest UID; all capabilities dropped;
  no-new-privileges; separate PID/IPC/UTS namespaces; network=none.
- Container image is preloaded and addressed by digest; pull=never.
- No guest secret injection. A future scoped secret broker requires separate
  credentials admission, revocation, expiration and guest isolation testing.
- The host transport must not permit shell substitution, cross-VM command
  routing, escape via untrusted environment variables, or unbounded output.
- All operations re-resolve the account VM. In-memory guest generation is
  deliberately not interpreted as the durable generation.

IMPORTANT: these argv flags are not proof that the provider supports them or
that the kernel is enforcing them. Rootless user namespace mappings, cgroup
limits, seccomp, pause/unpause, and application execution must be checked live.

## Staging qualification (required before changing adapter ID or wiring route)

1. Independently establish the Daytona organization actually provisions a
   genuine Linux VM; no silent container substitution. Record provider
   sandbox class, snapshot/image, VM ID and host attestation as review evidence.
2. On a disposable staging VM only, install pinned Podman + OCI guest image.
   Verify /etc/subuid and /etc/subgid allocation and rootless userns-auto.
   Confirm no privileged fallback when capabilities are unavailable.
3. Run two workspaces in one account. From A attempt to read B's files, PID
   namespace, credentials, Unix sockets, and network endpoints. Deny every
   attempt. Repeat after guest pause/resume and supervisor restart.
4. Run two accounts with the same shared-workspace ID. Confirm distinct owner
   VM IDs, guest IDs, user namespace mappings, and unable to access each
   other's resources. Test revoked membership and viewer admission.
5. Exercise cgroup CPU/memory/PID enforcement; rootfs writes, tmpfs quota,
   symlink escapes, host metadata IP probing, and attempts to mount
   host paths or reach provider credentials.
6. Terminate the command transport halfway through create, inspect, pause,
   unpause, and destroy. Reconcile orphan containers without automatically
   creating replacements. Keep generation fencing and durable state.
7. Confirm timeout and output limits, no secret or provider URL leakage in
   API responses/logs, and per-user operation rate and budget caps.
8. Review with security and record test evidence. Only then can a separate
   PR bind a trusted Daytona runner to this adapter and activate staged flags.

## Before any execution beyond mocks: A3.4

The current GuestSupervisor remains an in-process model; A3.4 must replace
that state with DB-backed leases and generation CAS. Required:
- Unique (owner_user_id, workspace_id) durable guest record and stable
  provider ID, with uncertain/quarantined outcome retained for reconciliation.
- Lease acquisition and account VM ready->suspending transitions in the same
  database serialization domain. New leases must be refused while suspending.
- Explicit fencing tokens on each guest operation and verified lease ownership
  at the trusted in-VM command runner, not just at the Next.js API.
- Account-wide capacity reservations and expirations, crash-safe recovery,
  and safe rechecks after membership revocation.
- Do not permit provider operations before successful durable CAS; provider
  calls are not transactional and require idempotent operation keys/evidence.

## Existing feature boundaries

No production migrations, credentials, flags, merge, Vercel Sandbox previews,
public preview origins, or Product Hunt launch routes are changed by A3.3.
Code Builder preview continues to execute separately in Vercel Sandbox.
