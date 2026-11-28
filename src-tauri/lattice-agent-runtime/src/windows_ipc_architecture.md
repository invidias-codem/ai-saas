//! Windows Named-Pipe IPC Transport — Architecture Specification
//!
//! This document specifies the Windows IPC transport for the Lattice agent runtime.
//! It is implemented behind a default-off feature gate (`windows-ipc`) and remains
//! unsupported until functional and security qualification passes.
//!
//! # Threat Model
//!
//! - Unauthenticated local clients must not execute commands.
//! - Cross-user and cross-session access must be prevented.
//! - Replayed requests must be rejected.
//! - Malformed requests must not crash the server.
//! - Credential compromise on one session must not affect other sessions.
//!
//! # Design
//!
//! ## Transport: Windows Named Pipes
//!
//! Pipe name: `\\.\pipe\lattice-ipc-<profile_id>-<session_id>`
//! - `profile_id`: isolates runtime profiles
//! - `session_id`: isolates logon sessions (prevents cross-session access)
//!
//! ## Access Control
//!
//! Security descriptor grants access only to the creating user's logon SID.
//! Implemented via `windows-sys` `SECURITY_DESCRIPTOR` + `SetSecurityDescriptorDacl`.
//! Cross-user access is denied at the kernel ACL level.
//!
//! ## Authentication
//!
//! 1. Client connects and sends `Hello` with `client_identity`.
//! 2. Server responds with `HelloResponse { accepted: true }` + server nonce.
//! 3. Client sends `Authenticate { token }` where token is obtained from
//!    Credential Broker (Windows Credential Manager).
//! 4. Server validates token against Credential Broker, binds session identity.
//! 5. Server responds with `AuthenticateResponse { success, session_id }`.
//! 6. Only authenticated clients may send `Command`.
//!
//! ## Replay Resistance
//!
//! - Server generates a random nonce per connection (in HelloResponse).
//! - Client includes nonce in `Authenticate` token validation.
//! - Server tracks used nonces with TTL; rejects duplicates.
//! - Each `Command` includes `request_id`; server deduplicates recent IDs.
//!
//! ## Bounded Request Sizes
//!
//! - Max message size: 1 MB (4-byte length prefix enforces this).
//! - Oversized messages cause immediate disconnect.
//!
//! ## Supervisor Lifecycle
//!
//! - `IpcServerSupervisor` spawns and monitors the named pipe listener.
//! - On crash: deterministic teardown (close pipe, remove socket, clear state).
//! - On restart: new pipe instance, old sessions invalidated.
//! - Graceful shutdown: `Goodbye` to all clients, then close listener.
//!
//! # Windows API Surface
//!
//! - `CreateNamedPipeW` / `ConnectNamedPipe` for server-side
//! - `CreateFileW` for client-side
//! - `SetSecurityDescriptorDacl` for ACLs
//! - `GetCurrentProcessToken` / `GetTokenInformation` for user SID
//! - Overlapped I/O with completion ports (via tokio-named-pipes)
//!
//! # Feature Gate
//!
//! `windows-ipc` feature in Cargo.toml. When disabled:
//! - Windows `start()` returns `IpcError::Unsupported`
//! - Windows `connect()` returns `IpcError::Unsupported`
//! - No named pipe symbols compiled
//!
//! # Backward Compatibility
//!
//! - Unix/macOS: unchanged (Unix domain sockets)
//! - Windows: remains fail-closed until feature enabled and qualified
//! - IpcMessage enum unchanged
//! - IpcError unchanged
