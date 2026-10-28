use super::authority::Authority;
use super::review::*;
use super::HostError;
use std::sync::{Arc, Mutex};

fn scope(writable: bool) -> ReviewScope {
    ReviewScope {
        authority: Authority::generate().unwrap(),
        grant_id: format!("local-grant-{}", "d".repeat(32)),
        display_root: "/selected/project".into(),
        read_only: !writable,
    }
}
fn input(scope: &ReviewScope) -> ProposalInput {
    ProposalInput::CreateFile {
        grant_id: scope.grant_id.clone(),
        relative_path: "draft.md".into(),
        content: "<script>untrusted</script>\n资料".into(),
    }
}
fn accepted(book: &mut ReviewBook, scope: ReviewScope) -> (ProposalSummary, ProposalInput) {
    let op = input(&scope);
    let summary = book.propose(scope.clone(), op.clone()).unwrap();
    let lease = book.begin(&summary.proposal_id, &scope).unwrap();
    let doc = book.document(&lease, &scope).unwrap();
    book.displayed(&lease, &scope, &doc.proposal_id, &doc.digest)
        .unwrap();
    book.decide(
        &lease,
        &scope,
        &doc.proposal_id,
        &doc.digest,
        Decision::Accept,
    )
    .unwrap();
    (summary, op)
}

#[tokio::test]
async fn display_and_native_instance_are_required_before_acceptance() {
    let mut book = ReviewBook::default();
    let scope = scope(true);
    let p = book.propose(scope.clone(), input(&scope)).unwrap();
    let lease = book.begin(&p.proposal_id, &scope).unwrap();
    assert!(book
        .decide(&lease, &scope, &p.proposal_id, &p.digest, Decision::Accept)
        .is_err());
    assert!(book.consume(&p.proposal_id, &scope, input(&scope)).is_err());
}

#[tokio::test]
async fn an_exact_native_decision_consumes_once_under_concurrency() {
    let scope = scope(true);
    let mut book = ReviewBook::default();
    let (p, op) = accepted(&mut book, scope.clone());
    let book = Arc::new(Mutex::new(book));
    let mut threads = Vec::new();
    for _ in 0..8 {
        let book = book.clone();
        let id = p.proposal_id.clone();
        let scope = scope.clone();
        let op = op.clone();
        threads.push(std::thread::spawn(move || {
            book.lock().unwrap().consume(&id, &scope, op).is_ok()
        }));
    }
    let count = threads
        .into_iter()
        .map(|t| t.join().unwrap())
        .filter(|success| *success)
        .count();
    assert_eq!(count, 1);
}

#[tokio::test(start_paused = true)]
async fn expiry_uses_monotonic_time_and_invalidates_an_open_review() {
    let mut book = ReviewBook::default();
    let scope = scope(true);
    let p = book.propose(scope.clone(), input(&scope)).unwrap();
    let lease = book.begin(&p.proposal_id, &scope).unwrap();
    tokio::time::advance(std::time::Duration::from_secs(300)).await;
    assert!(book.document(&lease, &scope).is_err());
    assert!(!lease.is_active());
    assert_eq!(
        book.status(&p.proposal_id).unwrap().status,
        ProposalState::Expired
    );
}

#[tokio::test]
async fn readonly_or_changed_scope_and_payload_cannot_consume_an_acceptance() {
    let mut book = ReviewBook::default();
    let readonly = scope(false);
    let (p, op) = accepted(&mut book, readonly.clone());
    assert!(matches!(
        book.consume(&p.proposal_id, &readonly, op),
        Err(HostError::WriteGrantRequired)
    ));
    let writable = scope(true);
    let (p, mut op) = accepted(&mut book, writable.clone());
    if let ProposalInput::CreateFile { content, .. } = &mut op {
        content.push('!')
    }
    assert!(book.consume(&p.proposal_id, &writable, op).is_err());
    let (p, op) = accepted(&mut book, writable.clone());
    let mut stale = writable.clone();
    stale.authority = stale.authority.with_grant_revision(99);
    assert!(book.consume(&p.proposal_id, &stale, op).is_err());
}

#[tokio::test]
async fn close_and_revocation_deny_the_current_native_instance() {
    let mut book = ReviewBook::default();
    let scope = scope(true);
    let p = book.propose(scope.clone(), input(&scope)).unwrap();
    let lease = book.begin(&p.proposal_id, &scope).unwrap();
    lease.deny();
    assert!(book.document(&lease, &scope).is_err());
    assert_eq!(
        book.status(&p.proposal_id).unwrap().status,
        ProposalState::Denied
    );
    let (p, op) = accepted(&mut book, scope.clone());
    book.invalidate();
    assert!(book.consume(&p.proposal_id, &scope, op).is_err());
}

#[tokio::test]
async fn canonical_fixtures_bind_exact_bytes_scope_and_exclusive_creation() {
    use serde::Deserialize;
    #[derive(Deserialize)]
    struct Material {
        proposal_id: String,
        authority: Authority,
        display_root: String,
        read_only: bool,
        ttl_ms: u32,
        operation: ProposalInput,
    }
    #[derive(Deserialize)]
    struct Fixture {
        material: Material,
        digest: String,
    }
    let fixtures: Vec<Fixture> = serde_json::from_str(include_str!(
        "../../../testdata/native-proposal-digests.json"
    ))
    .unwrap();
    for fixture in fixtures {
        let m = fixture.material;
        assert_eq!(m.ttl_ms, 300000);
        let scope = ReviewScope {
            authority: m.authority,
            grant_id: m.operation.grant_id().into(),
            display_root: m.display_root,
            read_only: m.read_only,
        };
        let bytes = canonical(&m.proposal_id, &scope, &m.operation);
        use sha3::{Digest, Sha3_256};
        assert_eq!(
            Sha3_256::digest(&bytes)
                .iter()
                .map(|b| format!("{b:02x}"))
                .collect::<String>(),
            fixture.digest
        );
    }
}

#[tokio::test]
async fn a_foreign_native_lease_cannot_read_or_acknowledge_the_active_record() {
    let scope = scope(true);
    let mut first = ReviewBook::default();
    let p = first.propose(scope.clone(), input(&scope)).unwrap();
    let original = first.begin(&p.proposal_id, &scope).unwrap();
    let mut other = ReviewBook::default();
    let q = other.propose(scope.clone(), input(&scope)).unwrap();
    let forged = other.begin(&q.proposal_id, &scope).unwrap();
    assert!(first.document(&forged, &scope).is_err());
    assert!(first
        .displayed(&forged, &scope, &p.proposal_id, &p.digest)
        .is_err());
    assert!(first.document(&original, &scope).is_ok());
}

#[tokio::test]
async fn changed_display_and_changed_consumption_require_a_new_review() {
    let scope = scope(true);
    let mut book = ReviewBook::default();
    let p = book.propose(scope.clone(), input(&scope)).unwrap();
    let lease = book.begin(&p.proposal_id, &scope).unwrap();
    assert!(book
        .displayed(&lease, &scope, &p.proposal_id, &"0".repeat(64))
        .is_err());
    assert!(!lease.is_active());
    assert!(book
        .decide(&lease, &scope, &p.proposal_id, &p.digest, Decision::Accept)
        .is_err());
    let (p, original) = accepted(&mut book, scope.clone());
    let changed = ProposalInput::CreateDirectory {
        grant_id: scope.grant_id.clone(),
        relative_path: "other".into(),
    };
    assert!(book.consume(&p.proposal_id, &scope, changed).is_err());
    assert!(book.consume(&p.proposal_id, &scope, original).is_err());
}

#[tokio::test]
async fn proposal_and_attempt_capacity_never_evict_replay_protection() {
    let scope = scope(true);
    let mut pending = ReviewBook::default();
    let mut ids = Vec::new();
    for _ in 0..32 {
        ids.push(
            pending
                .propose(scope.clone(), input(&scope))
                .unwrap()
                .proposal_id,
        )
    }
    assert!(matches!(
        pending.propose(scope.clone(), input(&scope)),
        Err(HostError::ProposalCapacity)
    ));
    for id in ids {
        pending.cancel(&id).unwrap();
    }
    assert!(pending.propose(scope.clone(), input(&scope)).is_ok());
    let mut book = ReviewBook::default();
    let mut first = None;
    for _ in 0..4096 {
        let (p, op) = accepted(&mut book, scope.clone());
        book.consume(&p.proposal_id, &scope, op.clone()).unwrap();
        if first.is_none() {
            first = Some((p.proposal_id, op));
        }
    }
    let (p, op) = accepted(&mut book, scope.clone());
    assert!(matches!(
        book.consume(&p.proposal_id, &scope, op),
        Err(HostError::ProposalCapacity)
    ));
    let (id, op) = first.unwrap();
    assert!(book.consume(&id, &scope, op).is_err());
}

#[tokio::test(start_paused = true)]
async fn accepted_decisions_expire_and_each_authority_dimension_is_bound() {
    let original = scope(true);
    let mut book = ReviewBook::default();
    let (p, op) = accepted(&mut book, original.clone());
    tokio::time::advance(REVIEW_LIFETIME).await;
    assert!(book.consume(&p.proposal_id, &original, op).is_err());
    assert_eq!(
        book.status(&p.proposal_id).unwrap().status,
        ProposalState::Expired
    );
    for dimension in 0..7 {
        let (p, op) = accepted(&mut book, original.clone());
        let mut changed = original.clone();
        match dimension {
            0 => changed.authority.principal_id.push('1'),
            1 => changed.authority.workspace_id.push('1'),
            2 => changed.authority.generation.push('1'),
            3 => changed.authority.policy_revision += 1,
            4 => changed.authority.grant_revision += 1,
            5 => changed.display_root.push('1'),
            _ => changed.grant_id.push('1'),
        }
        assert!(
            book.consume(&p.proposal_id, &changed, op).is_err(),
            "dimension {dimension}"
        );
        assert_eq!(
            book.status(&p.proposal_id).unwrap().status,
            ProposalState::Stale
        );
    }
}

#[tokio::test]
async fn complete_display_preserves_bytes_escapes_controls_and_rejects_oversize() {
    let scope = scope(false);
    let mut book = ReviewBook::default();
    let content = "<img onerror=execute()>\n\u{202e}%n 资料";
    let p = book
        .propose(
            scope.clone(),
            ProposalInput::CreateFile {
                grant_id: scope.grant_id.clone(),
                relative_path: "draft.txt".into(),
                content: content.into(),
            },
        )
        .unwrap();
    let lease = book.begin(&p.proposal_id, &scope).unwrap();
    let doc = book.document(&lease, &scope).unwrap();
    let displayed = doc.content_json.unwrap();
    assert!(!displayed.contains('\u{202e}'));
    assert!(displayed.contains("\\u202e"));
    assert_eq!(serde_json::from_str::<String>(&displayed).unwrap(), content);
    assert_eq!(doc.byte_count, content.len());
    assert_eq!(
        doc.content_hex.unwrap(),
        content
            .as_bytes()
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect::<String>()
    );
    assert!(book
        .propose(
            scope.clone(),
            ProposalInput::CreateFile {
                grant_id: scope.grant_id.clone(),
                relative_path: "large.txt".into(),
                content: "x".repeat(256 * 1024 + 1),
            }
        )
        .is_err());
    for input in [
        serde_json::json!({"kind":"execute_command","grant_id":scope.grant_id,"command":"whoami"}),
        serde_json::json!({"kind":"create_file","grant_id":scope.grant_id,"relative_path":"draft","content":"text","approved":true}),
    ] {
        assert!(serde_json::from_value::<ProposalInput>(input).is_err());
    }
}
