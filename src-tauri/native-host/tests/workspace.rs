mod common;
use common::fixture;
use lattice_native_host::{
    workspace::{DialogFuture, FolderPicker, ReadInput},
    HostError, LaunchCredential, RpcSession,
};
use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    },
};

struct Picker {
    path: Option<PathBuf>,
    allow: bool,
    confirmations: Arc<AtomicUsize>,
}
impl FolderPicker for Picker {
    fn pick_folder(&self) -> DialogFuture<'_, Option<PathBuf>> {
        Box::pin(async { Ok(self.path.clone()) })
    }
    fn confirm_read_access(&self, path: String) -> DialogFuture<'_, bool> {
        Box::pin(async move {
            assert!(PathBuf::from(path).is_absolute());
            self.confirmations.fetch_add(1, Ordering::SeqCst);
            Ok(self.allow)
        })
    }
}
fn picker(path: Option<PathBuf>, allow: bool) -> Picker {
    Picker {
        path,
        allow,
        confirmations: Arc::new(AtomicUsize::new(0)),
    }
}

#[tokio::test]
async fn cancellation_and_denial_cannot_install_any_grant() {
    let (port, calls, task) = fixture("").await;
    let session = RpcSession::new(port, Arc::new(LaunchCredential::generate().unwrap())).unwrap();
    session.bind_native().await.unwrap();
    let dir = tempfile::tempdir().unwrap();
    for choice in [
        picker(None, true),
        picker(Some(dir.path().to_owned()), false),
    ] {
        assert!(session.select_folder(&choice).await.unwrap().is_none());
    }
    assert!(session.workspace_grants().await.unwrap().is_empty());
    assert_eq!(
        calls.lock().unwrap().len(),
        2,
        "cancelled selection sent a control mutation"
    );
    task.abort();
}

#[tokio::test]
async fn confirmed_grants_use_native_ids_and_revision_scoped_typed_requests() {
    let (port, calls, task) = fixture("").await;
    let session = RpcSession::new(port, Arc::new(LaunchCredential::generate().unwrap())).unwrap();
    session.bind_native().await.unwrap();
    let dir = tempfile::tempdir().unwrap();
    let choice = picker(Some(dir.path().to_owned()), true);
    let grant = session.select_folder(&choice).await.unwrap().unwrap();
    assert!(grant.read_only);
    assert!(grant.grant_id.starts_with("local-grant-"));
    assert_eq!(choice.confirmations.load(Ordering::SeqCst), 1);
    let input = ReadInput {
        grant_id: grant.grant_id.clone(),
        relative_path: "note.md".into(),
    };
    assert_eq!(
        session.read_text(input.clone()).await.unwrap().content,
        "selected text"
    );
    assert_eq!(session.stat_path(input.clone()).await.unwrap().size, 13);
    assert_eq!(
        session.list_directory(input.clone()).await.unwrap().entries[0].name,
        "note.md"
    );
    session.revoke_grant(&grant.grant_id).await.unwrap();
    assert!(session.workspace_grants().await.unwrap().is_empty());
    assert!(matches!(
        session.read_text(input).await,
        Err(HostError::GrantDenied)
    ));
    session.status().await.unwrap();
    let calls = calls.lock().unwrap();
    let update = &calls[2];
    assert_eq!(update["action"], "native_update_grants");
    assert_eq!(update["authority"]["grant_revision"], 0);
    assert_eq!(update["inputs"]["next_revision"], 1);
    assert_eq!(calls[3]["authority"]["grant_revision"], 1);
    assert_eq!(calls.last().unwrap()["authority"]["grant_revision"], 2);
    assert_eq!(
        calls
            .iter()
            .filter(|r| r["action"] == "native_update_grants")
            .count(),
        2
    );
    task.abort();
}

#[tokio::test]
async fn uncertain_or_changed_grant_acknowledgements_block_all_workspace_admission() {
    for fault in ["grant_ack", "grant_timeout"] {
        let (port, calls, task) = fixture(fault).await;
        let session =
            RpcSession::new(port, Arc::new(LaunchCredential::generate().unwrap())).unwrap();
        session.bind_native().await.unwrap();
        let dir = tempfile::tempdir().unwrap();
        assert!(matches!(
            session
                .select_folder(&picker(Some(dir.path().to_owned()), true))
                .await,
            Err(HostError::WorkspaceBlocked)
        ));
        assert!(matches!(
            session.workspace_grants().await,
            Err(HostError::WorkspaceBlocked)
        ));
        assert!(matches!(
            session.status().await,
            Err(HostError::WorkspaceBlocked)
        ));
        assert_eq!(
            calls
                .lock()
                .unwrap()
                .iter()
                .filter(|r| r["action"] == "native_update_grants")
                .count(),
            1,
            "ambiguous permission update was retried"
        );
        task.abort();
    }
}

#[tokio::test]
async fn raw_paths_and_foreign_grants_are_rejected_before_daemon_dispatch() {
    let (port, calls, task) = fixture("").await;
    let session = RpcSession::new(port, Arc::new(LaunchCredential::generate().unwrap())).unwrap();
    session.bind_native().await.unwrap();
    let dir = tempfile::tempdir().unwrap();
    let grant = session
        .select_folder(&picker(Some(dir.path().to_owned()), true))
        .await
        .unwrap()
        .unwrap();
    let count = calls.lock().unwrap().len();
    for path in [
        "../secret",
        "/etc/passwd",
        r"C:\Windows",
        r"\\host\share",
        "file:stream",
        "NUL.txt",
        "a/../b",
    ] {
        assert!(
            matches!(
                session
                    .read_text(ReadInput {
                        grant_id: grant.grant_id.clone(),
                        relative_path: path.into()
                    })
                    .await,
                Err(HostError::PathInvalid)
            ),
            "accepted {path}"
        );
    }
    assert!(matches!(
        session
            .read_text(ReadInput {
                grant_id: "foreign".into(),
                relative_path: "note.md".into()
            })
            .await,
        Err(HostError::GrantDenied)
    ));
    assert_eq!(calls.lock().unwrap().len(), count);
    task.abort();
}

#[tokio::test]
async fn revocation_closes_new_read_admission_and_waits_for_the_admitted_read() {
    let (port, calls, task) = fixture("slow_read").await;
    let session =
        Arc::new(RpcSession::new(port, Arc::new(LaunchCredential::generate().unwrap())).unwrap());
    session.bind_native().await.unwrap();
    let dir = tempfile::tempdir().unwrap();
    let grant = session
        .select_folder(&picker(Some(dir.path().to_owned()), true))
        .await
        .unwrap()
        .unwrap();
    let input = ReadInput {
        grant_id: grant.grant_id.clone(),
        relative_path: "note.md".into(),
    };
    let reader = session.clone();
    let read_input = input.clone();
    let read = tokio::spawn(async move { reader.read_text(read_input).await });
    tokio::time::timeout(std::time::Duration::from_secs(1), async {
        while !calls
            .lock()
            .unwrap()
            .iter()
            .any(|c| c["action"] == "native_read_text")
        {
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    let revoker = session.clone();
    let id = grant.grant_id;
    let revoke = tokio::spawn(async move { revoker.revoke_grant(&id).await });
    tokio::time::sleep(std::time::Duration::from_millis(30)).await;
    assert!(
        !revoke.is_finished(),
        "revocation acknowledged an in-flight read"
    );
    assert!(matches!(
        session.read_text(input.clone()).await,
        Err(HostError::Busy)
    ));
    assert_eq!(read.await.unwrap().unwrap().content, "selected text");
    revoke.await.unwrap().unwrap();
    assert!(matches!(
        session.read_text(input).await,
        Err(HostError::GrantDenied)
    ));
    task.abort();
}

#[tokio::test]
async fn abandoning_a_dispatched_permission_future_poison_admission_without_retry() {
    let (port, calls, task) = fixture("grant_timeout").await;
    let session =
        Arc::new(RpcSession::new(port, Arc::new(LaunchCredential::generate().unwrap())).unwrap());
    session.bind_native().await.unwrap();
    let dir = tempfile::tempdir().unwrap();
    let choice = picker(Some(dir.path().to_owned()), true);
    let caller = session.clone();
    let selection = tokio::spawn(async move { caller.select_folder(&choice).await });
    tokio::time::timeout(std::time::Duration::from_secs(1), async {
        while !calls
            .lock()
            .unwrap()
            .iter()
            .any(|c| c["action"] == "native_update_grants")
        {
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    selection.abort();
    let _ = selection.await;
    assert!(matches!(
        session.workspace_grants().await,
        Err(HostError::WorkspaceBlocked)
    ));
    assert!(matches!(
        session.status().await,
        Err(HostError::WorkspaceBlocked)
    ));
    assert_eq!(
        calls
            .lock()
            .unwrap()
            .iter()
            .filter(|c| c["action"] == "native_update_grants")
            .count(),
        1
    );
    task.abort();
}

#[tokio::test]
async fn grant_capacity_does_not_evict_or_silently_replace_existing_permissions() {
    let (port, calls, task) = fixture("").await;
    let session = RpcSession::new(port, Arc::new(LaunchCredential::generate().unwrap())).unwrap();
    session.bind_native().await.unwrap();
    let dir = tempfile::tempdir().unwrap();
    for _ in 0..32 {
        session
            .select_folder(&picker(Some(dir.path().to_owned()), true))
            .await
            .unwrap()
            .unwrap();
    }
    let count = calls.lock().unwrap().len();
    assert!(matches!(
        session
            .select_folder(&picker(Some(dir.path().to_owned()), true))
            .await,
        Err(HostError::GrantDenied)
    ));
    assert_eq!(session.workspace_grants().await.unwrap().len(), 32);
    assert_eq!(calls.lock().unwrap().len(), count);
    task.abort();
}
