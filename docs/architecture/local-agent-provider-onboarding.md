# Local agent runtime, inference setup and shared commands

Status: proposed architecture; commands and new runtime behavior below are not implemented by this document.
Date: 2026-10-31.
Evidence baseline: main `cf0559eb97649eae2940472c35e170b57ddc26b5`; desktop evaluation PR #460 at `0b02c38f549bfd2151b645f9dc3d9f4ac842acb4`.
Scope: where the installed agent lives, model/provider setup, CLI slash commands, and a desktop interface modeled after the web app. This does not close native UI, installation, execution-sandbox or stable-release gates.

## Decisions

Lattice OS is the product; Weaver is the user-facing agent. The installed product owns an on-demand local agent runtime. A model provider supplies inference; NVIDIA NIM is not itself the local agent. The desktop and interactive CLI use one runtime contract, provider registry, configuration model and event protocol.

The web app retains its server runtime and authentication boundary. Shared contracts and presentation components do not mean shipping Next.js server modules, platform environment variables, Supabase administrative access or a company NVIDIA key to a device.

The local runtime should supervise the agent loop, sessions and task journal; Rust/native-host remains the authority boundary for local tools. Build on the packaged Go worker and Rust host. Adding the agent loop and provider transports is new work: the current worker is a guarded native-operation service, not a complete downloaded Weaver engine. Reuse the UCOL provider/routing semantics and extract portable contracts; do not assume server TypeScript modules execute inside Go or a WebView.

## Installation, data and lifetime

| Item | Proposed ownership/location |
| --- | --- |
| Application and bundled runtime | Installer-owned per-user application directory; binaries update together. Resolve paths through the installed native application, not the shell working directory. |
| Stable device state root | Native app-local-data directory for `xyz.gen1e.lattice-os`; on Windows, `%LOCALAPPDATA%\xyz.gen1e.lattice-os\`. |
| Preview state root | Separate app-local-data directory for `xyz.gen1e.lattice-os.preview`; never silently open a stable database with preview code. |
| Profile preferences | `profiles/<profile-id>/config.json`: versioned non-secret settings and opaque credential references. IDs come from the profile registry, not arbitrary paths. |
| Conversations and operational state | `profiles/<profile-id>/state.sqlite`: sessions, task/event journal and local memory records, with migrations and a single writer. This is new storage, not an existing promise of recovery. |
| Diagnostic logs and cache | Redacted local logs and disposable cache below the selected channel's root. |
| API keys and account refresh credentials | Native, OS-protected credential storage. No raw keys in JSON, SQLite, chat history, diagnostic exports or launch arguments. |
| Project files | Remain in the user's selected folders. Saving a workspace bookmark does not preserve native access authority. |
| Local model weights | Optional and explicitly selected; a hosted API key does not download weights or make inference offline. Existing local model servers can own their weights. |

Current code already starts `lattice-harness` from the native app, using authenticated parent stdio and an app-local-data `native-host` working directory (`src-tauri/src/native_host.rs`). Its lifetime is currently tied to the desktop application.

Target lifetime: start on demand for desktop or `lattice agent`; do not install an elevated Windows service or silently enable start-at-login. Background tasks and startup registration require a later explicit opt-in and budgets.

CLI and desktop need coordinated ownership of a profile's local runtime. A per-user/per-channel supervisor with authenticated IPC and per-client sessions is a separate implementation/security slice. On Windows use a private named pipe with an appropriate user ACL, authenticated client/session binding and protocol/version negotiation; do not expose a generic public HTTP command runner. Keep the Go worker's private stdio transport behind the native host. Until this broker is implemented and qualified, do not claim the existing Tauri-owned worker is attachable from the CLI.

Only one owner may execute a task or write the operational database at once. A restarted client may reconnect/reconcile events; it must not resubmit a mutation because a reply was lost. Clients do not inherit one another's folder grants, review leases or authority.

Persist conversations and task state, not native approvals. Restart must continue to retire grants/proposals/leases; require fresh access and review before new file changes. A CLI without a qualified review surface must fail closed on mutations needing native review.

## Three explicit inference routes

| Route | Setup and credentials | Request destination and billing |
| --- | --- | --- |
| Lattice-managed NVIDIA NIM | Sign into Lattice. The device keeps only that user's scoped session credentials. Company NVIDIA credentials stay in the server secret system. | Local runtime sends authorized inference requests through Lattice's authenticated gateway; server derives account/workspace membership, entitlements, credits and allowed models. |
| Bring your own key | Select a provider, including a personal NVIDIA NIM connection, and enter a key through masked input. Persist it through the native credential broker. | Device calls the selected provider directly. The provider bills the user. Uploading/storing the key with Lattice is a separate explicit choice, not a fallback. |
| Local model endpoint | Select and validate an already configured local inference endpoint and a compatible model. | Inference stays on that endpoint. Strict device-local mode accepts only the explicitly approved local endpoint and disables cloud fallback and cloud telemetry/content sync. |

A connection ID distinguishes managed NIM from personal NIM even though both identify the same inference provider. Registry metadata includes provider protocol, endpoint policy, model capabilities, credential requirements, limits and supported operations. Use an approved/discovered model catalog; do not hard-code a changing model ID into the setup wizard.

NVIDIA documents its hosted chat-completions API at https://docs.api.nvidia.com/nim/reference/llm-apis. Common wire compatibility does not prove every model supports the same tools, context size or streaming behavior. Qualify the selected model's capabilities before enabling agent tools.

Show destination and billing in both clients before a request. Folder read consent is not consent to upload a folder or its contents. Only explicitly selected/authorized context enters a cloud request. A provider change may change the data destination and must be visible; strict local or BYOK mode must never silently fall back to the company's NIM key.

For managed access, use registered native-client authentication with the system browser, authorization code + PKCE, exact callback/state binding and securely stored refresh credentials. See https://www.rfc-editor.org/rfc/rfc8252.html. Headless CLI authentication requires a separately implemented supported flow. Do not embed a confidential client secret in the binary.

Do not reuse `/api/cli/stream` as public client authentication: its current global token and client-supplied user ID are not the proposed per-user authorization contract. A new authenticated adapter must reuse the web application's identity, workspace, entitlement, cancellation, rate and credit checks.

## CLI and desktop commands

Preserve the existing appliance management commands. The current `lattice auth login` authenticates Docker Hub, not a Lattice user account. Add `lattice agent` for the interactive agent; the installer must package its client/launcher, resolve PATH collisions and preserve existing deployment commands. This client is not included merely by bundling the current desktop executable.

Slash commands are parsed as application commands before model dispatch. They are not shell commands, not model instructions and not a generic RPC escape hatch.

| Interactive CLI | Desktop equivalent | Semantics |
| --- | --- | --- |
| `/setup` | First-run setup / Settings | Choose inference route, validate access, select a default model, then run a user-approved connection check. |
| `/login`, `/logout` | Account | Lattice account session only; logout does not delete BYOK keys, projects or conversations. |
| `/provider` | Settings -> Models & Providers | Manage explicit provider connections and the profile default for new sessions. |
| `/key add <provider>` | Add / replace API key | Open masked input; never accept the key as a command argument. Return only configured/validation status. |
| `/models` | Model picker | Show models available on the selected connection with capability and availability status. |
| `/model <id>` | Conversation model picker | Change the current conversation's route for its next turn after validation. Does not modify a turn in flight. |
| `/model default <id>` | Settings -> Default model | Persist the default for new conversations. |
| `/workspace` | Workspace selector / Open folder | Select a workspace; native folder authorization is still required. |
| `/sessions`, `/resume <id>` | Conversation sidebar | List/resume permitted sessions; reconcile incomplete operations without replaying writes. |
| `/memory` | Memory view | Inspect/manage local memory under its retention policy; optional web sync is separate. |
| `/status` | Status indicator | Show profile, route, model, service health, data destination and account/credential status without secrets. |
| `/doctor` | Diagnostics | Check runtime, IPC, storage, keystore, provider and model; no paid probe without consent. |
| `/help` | Help / command palette | Generate available actions from the same versioned command registry. |

Provider/default changes do not silently reroute existing conversations. A conversation route change is explicit and applies only to a subsequent turn; a change in context destination requires acknowledgment. Unknown, unavailable or unauthorized commands fail with structured errors. User text beginning with a slash can be entered through an explicit literal-text escape; imported/model-generated text never executes setup commands.

Credential prompts bypass chat transcripts, history, traces, process arguments and diagnostics. Only the native credential/provider broker reads stored secret values. The UI receives opaque references and status, never a read-back API for raw keys. If storage is unavailable, saving fails explicitly.

## Desktop based on the web app

Reuse its visual system and extract presentation components for:
- Workspace and conversation sidebar.
- Streaming conversation and tool activity.
- Model/connection selector with visible Local, BYOK or Lattice-managed destination.
- Files/artifacts and task status.
- Account, Models & Providers, Memory, Permissions and Diagnostics settings.

Use transport adapters for web APIs versus authenticated native IPC; do not copy UI-specific provider lists or server-only modules. Keep trusted desktop assets bundled. Do not load the SaaS origin into the privileged native workspace window. A remote inference response is data, not permission to invoke tools.

The separate native review window remains the decision surface for exact file operations. Account login, an API key and provider/model selection do not grant filesystem access or qualify command execution.

Desktop and CLI on one device share profile state through the local runtime. Web account workspace sync is an explicit later feature with ownership, consent, conflict and retention rules; matching UI does not imply automatic cross-device memory synchronization.

## Existing seams that must change before BYOK ships

1. `scripts/lattice-cli/lattice_cli/main.py` and `config.py` implement appliance management and legacy `~/.lattice` configuration. Preserve that interface; introduce agent state through a dedicated versioned contract and explicit migration, not an automatic move of Docker configuration.
2. `lib/userProviderKeys.ts`, `ProviderKeysSection.tsx` and `lib/llm/providers/nvidiaNim.ts` have different provider surfaces. Replace duplicated UI enumerations with one registry/contract, including managed and personal NIM connections.
3. `lib/native/secretStore.ts` contains hard-coded unlock material and a silent no-op fallback. It is not a qualified local BYOK vault. Replace it with a native OS-protected broker, no raw-key readback and fail-closed errors; test real persistence across restart. Do not reproduce its unlock material or silently upload a local key to the web API.
4. The desktop login page/deep-link plumbing is an integration seam, not evidence that a scoped native authentication exchange is complete.
5. Existing native IPC grants and command sandbox denials remain in force throughout onboarding work.

## Implementation slices and exit criteria

1. **Contracts and secure storage:** versioned provider/connection/command/settings schemas; native path resolution; isolated preview state; credential broker; missing-store and secret-redaction regressions. No runtime behavior is claimed by this proposal.
2. **Local runtime ownership:** add the agent loop/provider boundary and qualified CLI/desktop transport; same-profile single writer, separate client authority, version mismatch rejection, cancel/drain/restart and ambiguous-operation reconciliation.
3. **Managed NIM:** registered per-user native login and authenticated inference adapter; server-owned model/credit policy; cancellation and rate-limit handling; no company credentials in packages or responses.
4. **Personal provider:** one supported BYOK provider end-to-end, then personal NVIDIA NIM through the same registry. A real credential/model check requires consent and correctly identifies provider billing.
5. **CLI and desktop onboarding:** interactive slash commands and web-inspired presentation call the same operations. Test one successful conversation and one native reviewed file change; both clients see the saved configuration/session state without sharing access authority.
6. **Optional local endpoint and release qualification:** enforce strict local egress policy, model capability validation, restart durability, upgrades/migrations/rollback, signed final binaries and actual Windows first-use evidence.

Each slice remains independently reviewable. This document changes no runtime, installer, secret migration, cloud synchronization or release behavior. Commands and acceptance cases describe work to implement and verify in subsequent slices.
