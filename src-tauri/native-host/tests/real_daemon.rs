use lattice_native_host::command::CommandInput;
use lattice_native_host::mutation::{OperationState, OperationStatus};
use lattice_native_host::review::{
    Decision, DisplayAcknowledgement, ProposalInput, ProposalState, ReviewDecision,
};
use lattice_native_host::workspace::{DialogFuture, FolderPicker, ReadInput};
use lattice_native_host::workspace::{GrantInfo, WriteConsent};
use lattice_native_host::{
    child_environment, HostError, LaunchCredential, RpcSession, StartupHandshake, STARTUP_TIMEOUT,
};
use std::{process::Stdio, sync::Arc};
use tokio::{
    io::AsyncReadExt,
    process::{Child, Command},
};

async fn port(child: &mut Child) -> u16 {
    let mut stdout = child.stdout.take().unwrap();
    let mut handshake = StartupHandshake::default();
    tokio::time::timeout(STARTUP_TIMEOUT, async {
        let mut chunk = [0u8; 1024];
        loop {
            let n = stdout.read(&mut chunk).await.expect("native stdout");
            assert!(n > 0, "daemon exited before readiness");
            if let Some(port) = handshake.push(&chunk[..n]).expect("valid native handshake") {
                return port;
            }
        }
    })
    .await
    .expect("bounded native startup")
}

fn binary() -> Option<std::ffi::OsString> {
    let path = std::env::var_os("LATTICE_TEST_DAEMON_PATH");
    if path.is_none() {
        eprintln!(
            "real-daemon test requires LATTICE_TEST_DAEMON_PATH (mandatory in native-host CI)"
        );
    }
    path
}

struct NativeWriteConsent(bool);
impl WriteConsent for NativeWriteConsent {
    fn confirm_write_access(&self, grant: GrantInfo) -> DialogFuture<'_, bool> {
        Box::pin(async move {
            assert!(grant.read_only);
            assert!(std::path::Path::new(&grant.display_path).is_absolute());
            Ok(self.0)
        })
    }
}
async fn accept_exact(session: &RpcSession, op: ProposalInput) -> String {
    let p = session.propose_operation(op).await.unwrap();
    let lease = session.begin_review(&p.proposal_id).await.unwrap();
    let doc = session.review_document(&lease).await.unwrap();
    session
        .acknowledge_review(
            &lease,
            DisplayAcknowledgement {
                proposal_id: p.proposal_id.clone(),
                digest: doc.digest.clone(),
            },
        )
        .await
        .unwrap();
    session
        .decide_review(
            &lease,
            ReviewDecision {
                proposal_id: p.proposal_id.clone(),
                digest: doc.digest,
                decision: Decision::Accept,
            },
        )
        .await
        .unwrap();
    p.proposal_id
}
async fn observed(session: &RpcSession, id: &str) -> OperationStatus {
    tokio::time::timeout(STARTUP_TIMEOUT, async {
        loop {
            let s = session.operation_status(id).await.unwrap();
            if !matches!(
                s.status,
                OperationState::Running | OperationState::OutcomeUnknown
            ) {
                return s;
            };
            tokio::time::sleep(std::time::Duration::from_millis(10)).await
        }
    })
    .await
    .expect("owned status reconciles")
}

#[tokio::test]
async fn every_native_command_mode_refuses_launch_without_a_qualified_provider() {
    let binary = binary().expect("command admission regression requires the CI daemon");
    let dir = tempfile::tempdir().unwrap();
    let selected = dir.path().join("project");
    std::fs::create_dir(&selected).unwrap();
    let (mut child, session) = native_session(binary, dir.path()).await;
    let session = Arc::new(session);
    let grant = session
        .select_folder(&DirectoryPicker {
            path: selected.clone(),
            replace: false,
        })
        .await
        .unwrap()
        .unwrap();
    assert!(grant.read_only);
    let direct = if cfg!(windows) {
        CommandInput::Direct {
            executable: "cmd.exe".into(),
            argv: vec![
                "/d".into(),
                "/s".into(),
                "/c".into(),
                "echo must-not-run>executed.txt".into(),
            ],
        }
    } else {
        CommandInput::Direct {
            executable: "sh".into(),
            argv: vec!["-c".into(), "printf must-not-run > executed.txt".into()],
        }
    };
    let commands = [
        direct,
        CommandInput::Cmd {
            script: "echo must-not-run>executed.txt".into(),
        },
        CommandInput::Powershell {
            script: "[IO.File]::WriteAllText('executed.txt','must-not-run')".into(),
        },
        CommandInput::Pwsh {
            script: "[IO.File]::WriteAllText('executed.txt','must-not-run')".into(),
        },
        CommandInput::Sh {
            script: "printf must-not-run > executed.txt".into(),
        },
    ];
    for command in commands {
        let op = ProposalInput::ExecuteCommand {
            grant_id: grant.grant_id.clone(),
            relative_path: ".".into(),
            command: command.clone(),
            timeout_seconds: Some(999),
        };
        let proposed = session.propose_operation(op).await;
        let supported = cfg!(windows) && !matches!(command, CommandInput::Sh { .. })
            || cfg!(target_os = "linux")
                && matches!(
                    command,
                    CommandInput::Direct { .. } | CommandInput::Sh { .. }
                );
        let p = match proposed {
            Ok(p) => {
                assert!(supported);
                p
            }
            Err(HostError::ShellUnavailable) => {
                assert!(!supported || matches!(command, CommandInput::Pwsh { .. }));
                assert!(!selected.join("executed.txt").exists());
                continue;
            }
            Err(e) => panic!("unexpected command preparation: {e}"),
        };
        let lease = session.begin_review(&p.proposal_id).await.unwrap();
        let doc = session.review_document(&lease).await.unwrap();
        let scope: serde_json::Value =
            serde_json::from_str(&doc.precondition_details_json).unwrap();
        assert_eq!(scope["provider"]["id"], "unavailable");
        assert_eq!(scope["timeout_ms"], 120000);
        assert_eq!(scope["output_limit"], 10240);
        assert_eq!(scope["requires_sandbox"], true);
        assert!(!doc.execution_available);
        session
            .acknowledge_review(
                &lease,
                DisplayAcknowledgement {
                    proposal_id: p.proposal_id.clone(),
                    digest: p.digest.clone(),
                },
            )
            .await
            .unwrap();
        session
            .decide_review(
                &lease,
                ReviewDecision {
                    proposal_id: p.proposal_id.clone(),
                    digest: p.digest,
                    decision: Decision::Accept,
                },
            )
            .await
            .unwrap();
        let result = session.dispatch_operation(&p.proposal_id).await.unwrap();
        assert_eq!(result.status, OperationState::Denied);
        assert_eq!(result.code, "LOCAL_SANDBOX_REQUIRED");
        assert!(!result.may_have_changed);
        assert!(!result.cleanup_pending);
        assert_eq!(
            session.operation_status(&p.proposal_id).await.unwrap().code,
            "LOCAL_SANDBOX_REQUIRED"
        );
        assert!(session.dispatch_operation(&p.proposal_id).await.is_err());
        assert!(matches!(
            session.command_output(&p.proposal_id).await,
            Err(HostError::OperationUnavailable)
        ));
        assert!(!selected.join("executed.txt").exists());
    }
    assert!(session.workspace_grants().await.unwrap()[0].read_only);
    session.shutdown().await.unwrap();
    assert!(child.wait().await.unwrap().success());
}

#[tokio::test]
async fn native_command_cancellation_releases_preparations_without_any_launch() {
    let binary = binary().expect("command admission regression requires the CI daemon");
    let dir = tempfile::tempdir().unwrap();
    let selected = dir.path().join("project");
    std::fs::create_dir(&selected).unwrap();
    let (mut child, session) = native_session(binary, dir.path()).await;
    let grant = session
        .select_folder(&DirectoryPicker {
            path: selected,
            replace: false,
        })
        .await
        .unwrap()
        .unwrap();
    for _ in 0..40 {
        let command = if cfg!(windows) {
            CommandInput::Cmd {
                script: "echo no-launch".into(),
            }
        } else {
            CommandInput::Sh {
                script: "printf no-launch".into(),
            }
        };
        let p = session
            .propose_operation(ProposalInput::ExecuteCommand {
                grant_id: grant.grant_id.clone(),
                relative_path: ".".into(),
                command,
                timeout_seconds: None,
            })
            .await
            .unwrap();
        session.cancel_proposal(&p.proposal_id).await.unwrap();
        assert_eq!(
            session
                .proposal_status(&p.proposal_id)
                .await
                .unwrap()
                .status,
            ProposalState::Denied
        );
    }
    session.shutdown().await.unwrap();
    assert!(child.wait().await.unwrap().success());
}

#[tokio::test]
async fn writable_access_requires_separate_consent_invalidates_reviews_and_dispatches_once() {
    let binary = binary().expect("real mutation regression requires the CI daemon");
    let dir = tempfile::tempdir().unwrap();
    let selected = dir.path().join("project");
    std::fs::create_dir(&selected).unwrap();
    let (mut child, session) = native_session(binary, dir.path()).await;
    let session = Arc::new(session);
    let g = session
        .select_folder(&DirectoryPicker {
            path: selected.clone(),
            replace: false,
        })
        .await
        .unwrap()
        .unwrap();
    let op = ProposalInput::CreateFile {
        grant_id: g.grant_id.clone(),
        relative_path: "new.txt".into(),
        content: "exact\n资料".into(),
    };
    let old = accept_exact(&session, op.clone()).await;
    assert!(matches!(
        session
            .request_write_access(&g.grant_id, &NativeWriteConsent(false))
            .await,
        Err(HostError::ReviewDenied)
    ));
    assert!(session.workspace_grants().await.unwrap()[0].read_only);
    assert!(matches!(
        session.dispatch_operation(&old).await,
        Err(HostError::WriteGrantRequired)
    ));
    assert!(
        !session
            .request_write_access(&g.grant_id, &NativeWriteConsent(true))
            .await
            .unwrap()
            .read_only
    );
    assert_eq!(
        session.proposal_status(&old).await.unwrap().status,
        ProposalState::Stale
    );
    assert!(session.dispatch_operation(&old).await.is_err());
    assert!(!selected.join("new.txt").exists());
    let id = accept_exact(&session, op).await;
    session.dispatch_operation(&id).await.unwrap();
    assert_eq!(
        observed(&session, &id).await.status,
        OperationState::Succeeded
    );
    assert_eq!(
        std::fs::read_to_string(selected.join("new.txt")).unwrap(),
        "exact\n资料"
    );
    assert!(session.dispatch_operation(&id).await.is_err());
    assert_eq!(
        session.cancel_operation(&id).await.unwrap().status,
        OperationState::Succeeded
    );
    let mkdir = accept_exact(
        &session,
        ProposalInput::CreateDirectory {
            grant_id: g.grant_id.clone(),
            relative_path: "new-dir".into(),
        },
    )
    .await;
    session.dispatch_operation(&mkdir).await.unwrap();
    assert_eq!(
        observed(&session, &mkdir).await.status,
        OperationState::Succeeded
    );
    assert!(selected.join("new-dir").is_dir());
    session.revoke_grant(&g.grant_id).await.unwrap();
    assert_eq!(
        session.operation_status(&id).await.unwrap().status,
        OperationState::Succeeded
    );
    session.shutdown().await.unwrap();
    assert!(matches!(
        session.operation_status(&id).await,
        Err(HostError::Closed)
    ));
    assert!(child.wait().await.unwrap().success());
}

#[tokio::test]
async fn overwrite_review_binds_complete_base_and_preserves_external_edits_on_conflict() {
    let binary = binary().expect("real mutation regression requires the CI daemon");
    let dir = tempfile::tempdir().unwrap();
    let selected = dir.path().join("project");
    std::fs::create_dir(&selected).unwrap();
    std::fs::write(
        selected.join("note.txt"),
        "before\n<script>literal</script>\u{202e}",
    )
    .unwrap();
    let (mut child, session) = native_session(binary, dir.path()).await;
    let session = Arc::new(session);
    let g = session
        .select_folder(&DirectoryPicker {
            path: selected.clone(),
            replace: false,
        })
        .await
        .unwrap()
        .unwrap();
    session
        .request_write_access(&g.grant_id, &NativeWriteConsent(true))
        .await
        .unwrap();
    let op = ProposalInput::WriteText {
        grant_id: g.grant_id.clone(),
        relative_path: "note.txt".into(),
        content: "new".into(),
    };
    let p = session.propose_operation(op.clone()).await.unwrap();
    let lease = session.begin_review(&p.proposal_id).await.unwrap();
    let doc = session.review_document(&lease).await.unwrap();
    assert_eq!(doc.precondition, "matches_base");
    let base = doc.base_content_json.unwrap();
    assert!(base.contains("\\u202e"));
    assert_eq!(
        serde_json::from_str::<String>(&base).unwrap(),
        "before\n<script>literal</script>\u{202e}"
    );
    session
        .acknowledge_review(
            &lease,
            DisplayAcknowledgement {
                proposal_id: p.proposal_id.clone(),
                digest: p.digest.clone(),
            },
        )
        .await
        .unwrap();
    session
        .decide_review(
            &lease,
            ReviewDecision {
                proposal_id: p.proposal_id.clone(),
                digest: p.digest,
                decision: Decision::Accept,
            },
        )
        .await
        .unwrap();
    std::fs::write(selected.join("note.txt"), "external edit").unwrap();
    session.dispatch_operation(&p.proposal_id).await.unwrap();
    assert_eq!(
        observed(&session, &p.proposal_id).await.status,
        OperationState::Conflict
    );
    assert_eq!(
        std::fs::read_to_string(selected.join("note.txt")).unwrap(),
        "external edit"
    );
    let id = accept_exact(&session, op).await;
    session.dispatch_operation(&id).await.unwrap();
    assert_eq!(
        observed(&session, &id).await.status,
        OperationState::Succeeded
    );
    assert_eq!(
        std::fs::read_to_string(selected.join("note.txt")).unwrap(),
        "new"
    );
    session.shutdown().await.unwrap();
    assert!(child.wait().await.unwrap().success());
}

#[tokio::test]
async fn abandoned_caller_and_lost_dispatch_reply_reconcile_existing_id_without_retry() {
    use std::sync::atomic::{AtomicUsize, Ordering};
    use tokio::{io::AsyncWriteExt, net::TcpListener, sync::oneshot};
    let binary = binary().expect("real mutation regression requires the CI daemon");
    let dir = tempfile::tempdir().unwrap();
    let selected = dir.path().join("project");
    std::fs::create_dir(&selected).unwrap();
    let credential = Arc::new(LaunchCredential::generate().unwrap());
    let mut child = Command::new(binary)
        .arg("--native-host")
        .env_clear()
        .envs(child_environment())
        .env("LATTICE_AUTH_TOKEN", credential.child_env_value())
        .current_dir(dir.path())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .spawn()
        .unwrap();
    let daemon_port = port(&mut child).await;
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let proxy_port = listener.local_addr().unwrap().port();
    let dispatches = Arc::new(AtomicUsize::new(0));
    let count = dispatches.clone();
    let (seen, received) = oneshot::channel();
    let (release, released) = oneshot::channel();
    let proxy = tokio::spawn(async move {
        let client = reqwest::Client::builder().no_proxy().build().unwrap();
        let mut seen = Some(seen);
        let mut released = Some(released);
        loop {
            let (mut stream, _) = listener.accept().await.unwrap();
            let mut bytes = Vec::new();
            let start = loop {
                let mut chunk = [0u8; 4096];
                let n = stream.read(&mut chunk).await.unwrap();
                assert!(n > 0 && bytes.len() < 1024 * 1024);
                bytes.extend_from_slice(&chunk[..n]);
                if let Some(i) = bytes.windows(4).position(|w| w == b"\r\n\r\n") {
                    break i + 4;
                }
            };
            let headers = String::from_utf8_lossy(&bytes[..start]);
            let len: usize = headers
                .lines()
                .find_map(|l| {
                    l.to_ascii_lowercase()
                        .strip_prefix("content-length:")
                        .map(|s| s.trim().parse().unwrap())
                })
                .unwrap();
            assert!(len < 1024 * 1024);
            while bytes.len() < start + len {
                let mut chunk = [0u8; 4096];
                let n = stream.read(&mut chunk).await.unwrap();
                assert!(n > 0);
                bytes.extend_from_slice(&chunk[..n])
            }
            let request: serde_json::Value =
                serde_json::from_slice(&bytes[start..start + len]).unwrap();
            let is_dispatch = request["action"] == "native_dispatch_mutation";
            let response = client
                .post(format!("http://127.0.0.1:{daemon_port}/rpc"))
                .json(&request)
                .send()
                .await
                .unwrap();
            assert!(response.status().is_success());
            let body = response.bytes().await.unwrap();
            if is_dispatch {
                count.fetch_add(1, Ordering::SeqCst);
                seen.take().unwrap().send(()).unwrap();
                released.take().unwrap().await.unwrap();
                continue;
            }
            stream
                .write_all(
                    format!(
                        "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                        body.len()
                    )
                    .as_bytes(),
                )
                .await
                .unwrap();
            stream.write_all(&body).await.unwrap();
        }
    });
    let session = Arc::new(RpcSession::new(proxy_port, credential).unwrap());
    session.bind_native().await.unwrap();
    let g = session
        .select_folder(&DirectoryPicker {
            path: selected.clone(),
            replace: false,
        })
        .await
        .unwrap()
        .unwrap();
    session
        .request_write_access(&g.grant_id, &NativeWriteConsent(true))
        .await
        .unwrap();
    let id = accept_exact(
        &session,
        ProposalInput::CreateFile {
            grant_id: g.grant_id,
            relative_path: "one.txt".into(),
            content: "one attempt".into(),
        },
    )
    .await;
    let s = session.clone();
    let dispatch_id = id.clone();
    let caller = tokio::spawn(async move { s.dispatch_operation(&dispatch_id).await });
    received.await.unwrap();
    caller.abort();
    let _ = caller.await;
    release.send(()).unwrap();
    assert_eq!(
        observed(&session, &id).await.status,
        OperationState::Succeeded
    );
    assert_eq!(dispatches.load(Ordering::SeqCst), 1);
    assert_eq!(
        std::fs::read_to_string(selected.join("one.txt")).unwrap(),
        "one attempt"
    );
    assert!(session.dispatch_operation(&id).await.is_err());
    assert_eq!(dispatches.load(Ordering::SeqCst), 1);
    session.shutdown().await.unwrap();
    assert!(child.wait().await.unwrap().success());
    proxy.abort();
    let _ = proxy.await;
}

#[tokio::test]
async fn native_review_records_exact_acceptance_without_granting_write_or_dispatch_authority() {
    let Some(binary) = binary() else { return };
    let dir = tempfile::tempdir().unwrap();
    let selected = dir.path().join("project");
    std::fs::create_dir(&selected).unwrap();
    let (mut child, session) = native_session(binary, dir.path()).await;
    let grant = session
        .select_folder(&DirectoryPicker {
            path: selected.clone(),
            replace: false,
        })
        .await
        .unwrap()
        .unwrap();
    let op = ProposalInput::CreateFile {
        grant_id: grant.grant_id.clone(),
        relative_path: "proposed.txt".into(),
        content: "exact new bytes\n<script>literal</script>".into(),
    };
    let p = session.propose_operation(op.clone()).await.unwrap();
    let lease = session.begin_review(&p.proposal_id).await.unwrap();
    let doc = session.review_document(&lease).await.unwrap();
    session
        .acknowledge_review(
            &lease,
            DisplayAcknowledgement {
                proposal_id: doc.proposal_id.clone(),
                digest: doc.digest.clone(),
            },
        )
        .await
        .unwrap();
    session
        .decide_review(
            &lease,
            ReviewDecision {
                proposal_id: doc.proposal_id.clone(),
                digest: doc.digest,
                decision: Decision::Accept,
            },
        )
        .await
        .unwrap();
    assert_eq!(
        session
            .proposal_status(&p.proposal_id)
            .await
            .unwrap()
            .status,
        ProposalState::Accepted
    );
    assert!(matches!(
        session.consume_approval(&p.proposal_id, op.clone()).await,
        Err(HostError::WriteGrantRequired)
    ));
    assert!(!selected.join("proposed.txt").exists());
    session.revoke_grant(&grant.grant_id).await.unwrap();
    assert_eq!(
        session
            .proposal_status(&p.proposal_id)
            .await
            .unwrap()
            .status,
        ProposalState::Stale
    );
    assert!(session.consume_approval(&p.proposal_id, op).await.is_err());
    session.shutdown().await.unwrap();
    assert!(child.wait().await.unwrap().success());
}

struct DirectoryPicker {
    path: std::path::PathBuf,
    replace: bool,
}
impl FolderPicker for DirectoryPicker {
    fn pick_folder(&self) -> DialogFuture<'_, Option<std::path::PathBuf>> {
        Box::pin(async { Ok(Some(self.path.clone())) })
    }
    fn confirm_read_access(&self, path: String) -> DialogFuture<'_, bool> {
        Box::pin(async move {
            assert_eq!(
                std::fs::canonicalize(&path).unwrap(),
                std::fs::canonicalize(&self.path).unwrap()
            );
            if self.replace {
                let old = self.path.with_extension("pinned");
                std::fs::rename(&self.path, &old).unwrap();
                std::fs::create_dir(&self.path).unwrap();
                std::fs::write(self.path.join("note.md"), "replacement").unwrap();
            }
            Ok(true)
        })
    }
}

async fn native_session(binary: std::ffi::OsString, dir: &std::path::Path) -> (Child, RpcSession) {
    let credential = Arc::new(LaunchCredential::generate().unwrap());
    let mut child = Command::new(binary)
        .arg("--native-host")
        .env_clear()
        .envs(child_environment())
        .env("LATTICE_AUTH_TOKEN", credential.child_env_value())
        .current_dir(dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .spawn()
        .unwrap();
    let port = port(&mut child).await;
    let session = RpcSession::new(port, credential).unwrap();
    session.bind_native().await.unwrap();
    (child, session)
}

#[tokio::test]
async fn native_selected_directory_identity_and_typed_reads_work_with_real_go() {
    let Some(binary) = binary() else { return };
    let dir = tempfile::tempdir().unwrap();
    let selected = dir.path().join("project");
    std::fs::create_dir(&selected).unwrap();
    std::fs::write(selected.join("note.md"), "selected text\n资料").unwrap();
    let (mut child, session) = native_session(binary, dir.path()).await;
    let grant = session
        .select_folder(&DirectoryPicker {
            path: selected,
            replace: false,
        })
        .await
        .unwrap()
        .unwrap();
    let input = ReadInput {
        grant_id: grant.grant_id.clone(),
        relative_path: "note.md".into(),
    };
    assert_eq!(
        session.read_text(input.clone()).await.unwrap().content,
        "selected text\n资料"
    );
    assert!(session.stat_path(input.clone()).await.unwrap().size > 0);
    assert_eq!(
        session
            .list_directory(ReadInput {
                relative_path: ".".into(),
                ..input.clone()
            })
            .await
            .unwrap()
            .entries[0]
            .name,
        "note.md"
    );
    session.revoke_grant(&grant.grant_id).await.unwrap();
    assert!(matches!(
        session.read_text(input).await,
        Err(HostError::GrantDenied)
    ));
    session.status().await.unwrap();
    session.shutdown().await.unwrap();
    assert!(tokio::time::timeout(STARTUP_TIMEOUT, child.wait())
        .await
        .unwrap()
        .unwrap()
        .success());
}

#[tokio::test]
async fn directory_replaced_during_native_confirmation_never_grants_the_replacement() {
    let Some(binary) = binary() else { return };
    let dir = tempfile::tempdir().unwrap();
    let selected = dir.path().join("project");
    std::fs::create_dir(&selected).unwrap();
    std::fs::write(selected.join("note.md"), "selected").unwrap();
    let (mut child, session) = native_session(binary, dir.path()).await;
    assert!(matches!(
        session
            .select_folder(&DirectoryPicker {
                path: selected,
                replace: true
            })
            .await,
        Err(HostError::WorkspaceBlocked)
    ));
    assert!(matches!(
        session.workspace_grants().await,
        Err(HostError::WorkspaceBlocked)
    ));
    session.shutdown().await.unwrap();
    assert!(tokio::time::timeout(STARTUP_TIMEOUT, child.wait())
        .await
        .unwrap()
        .unwrap()
        .success());
}

#[tokio::test]
async fn rust_status_authenticates_with_this_launchs_credential() {
    let Some(binary) = binary() else { return };
    let dir = tempfile::tempdir().unwrap();
    let credential = Arc::new(LaunchCredential::generate().unwrap());
    let mut child = Command::new(binary)
        .arg("--native-host")
        .env_clear()
        .envs(child_environment())
        .env("LATTICE_AUTH_TOKEN", credential.child_env_value())
        .current_dir(dir.path())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .spawn()
        .expect("spawn real daemon");
    let port = port(&mut child).await;
    let wrong = RpcSession::new(port, Arc::new(LaunchCredential::generate().unwrap())).unwrap();
    assert!(matches!(wrong.status().await, Err(HostError::RpcRejected)));
    let session = RpcSession::new(port, credential).unwrap();
    assert!(session.status().await.unwrap().events.is_empty());
    session
        .bind_native()
        .await
        .expect("enroll the real native daemon");
    assert!(session.status().await.unwrap().events.is_empty());
    assert!(
        !dir.path().join("lattice_vectors.db").exists(),
        "native mode initialized unexposed shared memory"
    );
    session.close();
    assert!(matches!(session.status().await, Err(HostError::Closed)));
    child.kill().await.unwrap();
    child.wait().await.unwrap();
}

#[tokio::test]
async fn standalone_daemons_cannot_satisfy_native_enrollment() {
    let Some(binary) = binary() else { return };
    let dir = tempfile::tempdir().unwrap();
    let credential = Arc::new(LaunchCredential::generate().unwrap());
    let mut child = Command::new(binary)
        .env_clear()
        .envs(child_environment())
        .env("LATTICE_AUTH_TOKEN", credential.child_env_value())
        .current_dir(dir.path())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .spawn()
        .unwrap();
    let port = port(&mut child).await;
    let session = RpcSession::new(port, credential).unwrap();
    assert!(session.bind_native().await.is_err());
    assert!(matches!(session.status().await, Err(HostError::Closed)));
    child.kill().await.unwrap();
    child.wait().await.unwrap();
}

#[tokio::test]
async fn missing_launch_auth_exits_without_a_ready_frame() {
    let Some(binary) = binary() else { return };
    let dir = tempfile::tempdir().unwrap();
    let output = tokio::time::timeout(
        STARTUP_TIMEOUT,
        Command::new(binary)
            .env_clear()
            .envs(child_environment())
            .current_dir(dir.path())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .kill_on_drop(true)
            .output(),
    )
    .await
    .unwrap()
    .unwrap();
    assert!(!output.status.success());
    assert!(
        output.stdout.is_empty(),
        "unauthenticated startup must not advertise readiness"
    );
}
