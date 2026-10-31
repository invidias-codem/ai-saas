//! Immutable proposals and native-only review leases. An ID or digest is a
//! reference, never a bearer approval. No execution endpoint is exposed here.
use crate::{
    authority::{random_id, Authority},
    mutation::{FilePrecondition, PreparedMutation},
    workspace::{valid_relative_path, GrantState, MAX_TEXT_BYTES},
    HostError, RpcSession,
};
use serde::{Deserialize, Serialize};
use sha3::{Digest, Sha3_256};
use std::{
    collections::{HashMap, HashSet, VecDeque},
    sync::{
        atomic::{AtomicU8, Ordering},
        Arc,
    },
};
use tokio::{
    sync::watch,
    time::{Duration, Instant},
};

pub const REVIEW_LIFETIME: Duration = Duration::from_secs(300);
const MAX_PENDING: usize = 32;
const MAX_ATTEMPTS: usize = 4096;
const MAX_DOCUMENT: usize = 2 * 1024 * 1024;

#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum ProposalInput {
    CreateFile {
        grant_id: String,
        relative_path: String,
        content: String,
    },
    WriteText {
        grant_id: String,
        relative_path: String,
        content: String,
    },
    CreateDirectory {
        grant_id: String,
        relative_path: String,
    },
}
impl ProposalInput {
    pub fn grant_id(&self) -> &str {
        match self {
            Self::CreateFile { grant_id, .. }
            | Self::WriteText { grant_id, .. }
            | Self::CreateDirectory { grant_id, .. } => grant_id,
        }
    }
    fn path(&self) -> &str {
        match self {
            Self::CreateFile { relative_path, .. }
            | Self::WriteText { relative_path, .. }
            | Self::CreateDirectory { relative_path, .. } => relative_path,
        }
    }
    fn kind(&self) -> &'static str {
        match self {
            Self::CreateFile { .. } => "create_file",
            Self::WriteText { .. } => "write_text",
            Self::CreateDirectory { .. } => "create_directory",
        }
    }
    pub(crate) fn validate(&self) -> Result<(), HostError> {
        if self.path() == "." || !valid_relative_path(self.path()) {
            return Err(HostError::PathInvalid);
        }
        if let Self::CreateFile { content, .. } | Self::WriteText { content, .. } = self {
            if content.len() > MAX_TEXT_BYTES || content.contains('\0') {
                return Err(HostError::ProposalInvalid);
            }
        }
        Ok(())
    }
}
#[derive(Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ProposalReference {
    pub proposal_id: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DisplayAcknowledgement {
    pub proposal_id: String,
    pub digest: String,
}
#[derive(Copy, Clone, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Decision {
    Accept,
    Deny,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ReviewDecision {
    pub proposal_id: String,
    pub digest: String,
    pub decision: Decision,
}

#[derive(Clone, PartialEq, Eq)]
pub(crate) struct ReviewScope {
    pub(crate) authority: Authority,
    pub(crate) grant_id: String,
    pub(crate) display_root: String,
    pub(crate) read_only: bool,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ProposalState {
    Pending,
    Reviewing,
    Accepted,
    Denied,
    Expired,
    Stale,
    Consumed,
}
#[derive(Clone, Serialize)]
pub struct ProposalSummary {
    pub proposal_id: String,
    pub digest: String,
    pub status: ProposalState,
    pub kind: String,
    pub grant_id: String,
    pub relative_path: String,
    pub execution_available: bool,
}
#[derive(Serialize)]
pub struct ReviewDocument {
    pub schema_version: u32,
    pub proposal_id: String,
    pub digest: String,
    pub kind: String,
    pub display_root_json: String,
    pub relative_path_json: String,
    pub precondition: String,
    pub precondition_details_json: String,
    pub base_content_json: Option<String>,
    pub base_content_hex: Option<String>,
    pub base_byte_count: usize,
    pub content_json: Option<String>,
    pub content_hex: Option<String>,
    pub byte_count: usize,
    pub read_only: bool,
    pub execution_available: bool,
    pub expires_in_ms: u64,
}

fn field(bytes: &mut Vec<u8>, value: &str) {
    bytes.extend_from_slice(&(value.len() as u32).to_be_bytes());
    bytes.extend_from_slice(value.as_bytes());
}
#[cfg(test)]
pub(crate) fn canonical(id: &str, scope: &ReviewScope, op: &ProposalInput) -> Vec<u8> {
    canonical_prepared(id, scope, op, None)
}
pub(crate) fn canonical_prepared(
    id: &str,
    scope: &ReviewScope,
    op: &ProposalInput,
    pre: Option<&FilePrecondition>,
) -> Vec<u8> {
    let mut bytes = b"LATTICE_NATIVE_PROPOSAL\0\x01".to_vec();
    if pre.is_some() {
        *bytes.last_mut().unwrap() = 2;
    }
    for value in [
        id,
        &scope.authority.principal_id,
        &scope.authority.workspace_id,
        &scope.authority.generation,
    ] {
        field(&mut bytes, value)
    }
    bytes.extend_from_slice(&scope.authority.policy_revision.to_be_bytes());
    bytes.extend_from_slice(&scope.authority.grant_revision.to_be_bytes());
    field(&mut bytes, &scope.grant_id);
    field(&mut bytes, &scope.display_root);
    bytes.push(u8::from(scope.read_only));
    bytes.extend_from_slice(&300000u32.to_be_bytes());
    bytes.push(match op {
        ProposalInput::CreateFile { .. } => 1,
        ProposalInput::CreateDirectory { .. } => 2,
        ProposalInput::WriteText { .. } => 3,
    });
    field(&mut bytes, op.path());
    if let ProposalInput::CreateFile { content, .. } | ProposalInput::WriteText { content, .. } = op
    {
        field(&mut bytes, content)
    }
    if let Some(pre) = pre {
        field(&mut bytes, &pre.parent_identity.volume);
        field(&mut bytes, &pre.parent_identity.file);
        if let Some(base) = &pre.base {
            field(&mut bytes, "matches_base");
            field(&mut bytes, &base.identity.volume);
            field(&mut bytes, &base.identity.file);
            field(&mut bytes, &base.content_sha3);
            bytes.extend_from_slice(&(base.byte_count as u64).to_be_bytes());
        } else {
            field(&mut bytes, "must_be_absent");
        }
    } else {
        field(&mut bytes, "must_be_absent");
    }
    bytes
}
pub(crate) fn digest(bytes: &[u8]) -> String {
    Sha3_256::digest(bytes)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}
fn display_json(value: &str) -> Result<String, HostError> {
    let text = serde_json::to_string(value).map_err(|_| HostError::InvalidResponse)?;
    Ok(text
        .chars()
        .map(|c| {
            if c.is_control()
                || matches!(c, '\u{061c}' | '\u{200e}' | '\u{200f}')
                || ('\u{202a}'..='\u{202e}').contains(&c)
                || ('\u{2066}'..='\u{2069}').contains(&c)
            {
                format!("\\u{:04x}", c as u32)
            } else {
                c.to_string()
            }
        })
        .collect())
}

struct LeaseInner {
    proposal_id: String,
    label: String,
    deadline: Instant,
    reason: AtomicU8,
    changed: watch::Sender<u8>,
}
/// Only Rust can construct or clone the lease; it has no serialization/debug
/// implementation and cannot be supplied as a frontend approval credential.
#[derive(Clone)]
pub struct ReviewLease(Arc<LeaseInner>);
impl ReviewLease {
    pub fn label(&self) -> &str {
        &self.0.label
    }
    pub fn is_active(&self) -> bool {
        self.0.reason.load(Ordering::Acquire) == 0 && Instant::now() < self.0.deadline
    }
    pub fn deny(&self) {
        self.finish(2);
    }
    fn finish(&self, reason: u8) -> bool {
        if self
            .0
            .reason
            .compare_exchange(0, reason, Ordering::AcqRel, Ordering::Acquire)
            .is_ok()
        {
            self.0.changed.send_replace(reason);
            true
        } else {
            false
        }
    }
    pub async fn finished(&self) {
        let mut changed = self.0.changed.subscribe();
        if *changed.borrow() != 0 {
            return;
        }
        tokio::select! {_=changed.changed()=>{},_=tokio::time::sleep_until(self.0.deadline)=>{self.finish(3);}}
    }
}

struct Entry {
    id: String,
    scope: ReviewScope,
    op: ProposalInput,
    digest: String,
    deadline: Instant,
    state: ProposalState,
    displayed: bool,
    precondition: Option<FilePrecondition>,
}
impl Entry {
    fn summary(&self) -> ProposalSummary {
        ProposalSummary {
            proposal_id: self.id.clone(),
            digest: self.digest.clone(),
            status: self.state,
            kind: self.op.kind().into(),
            grant_id: self.scope.grant_id.clone(),
            relative_path: self.op.path().into(),
            execution_available: false,
        }
    }
    fn document(&self) -> Result<ReviewDocument, HostError> {
        let content = match &self.op {
            ProposalInput::CreateFile { content, .. }
            | ProposalInput::WriteText { content, .. } => Some(content),
            _ => None,
        };
        let base = self.precondition.as_ref().and_then(|p| p.base.as_ref());
        let metadata = self.precondition.as_ref().map(|p|serde_json::json!({"parent_identity":p.parent_identity,"base":p.base.as_ref().map(|b|serde_json::json!({"identity":b.identity,"content_sha3":b.content_sha3,"byte_count":b.byte_count}))}));
        let doc = ReviewDocument {
            schema_version: 2,
            proposal_id: self.id.clone(),
            digest: self.digest.clone(),
            kind: self.op.kind().into(),
            display_root_json: display_json(&self.scope.display_root)?,
            relative_path_json: display_json(self.op.path())?,
            precondition: if base.is_some() {
                "matches_base"
            } else {
                "must_be_absent"
            }
            .into(),
            precondition_details_json: serde_json::to_string(&metadata)
                .map_err(|_| HostError::InvalidResponse)?,
            base_content_json: base.map(|b| display_json(&b.content)).transpose()?,
            base_content_hex: base.map(|b| {
                b.content
                    .as_bytes()
                    .iter()
                    .map(|b| format!("{b:02x}"))
                    .collect()
            }),
            base_byte_count: base.map_or(0, |b| b.byte_count),
            content_json: content.map(|s| display_json(s)).transpose()?,
            content_hex: content.map(|s| s.as_bytes().iter().map(|b| format!("{b:02x}")).collect()),
            byte_count: content.map_or(0, |s| s.len()),
            read_only: self.scope.read_only,
            execution_available: false,
            expires_in_ms: self
                .deadline
                .saturating_duration_since(Instant::now())
                .as_millis()
                .min(300000) as u64,
        };
        if serde_json::to_vec(&doc)
            .map_err(|_| HostError::InvalidResponse)?
            .len()
            > MAX_DOCUMENT
        {
            return Err(HostError::ProposalTooLarge);
        }
        Ok(doc)
    }
}

/// Opaque, non-cloneable, non-serializable native dispatch material. S2c.4 will
/// add Go admission; current production grants cannot reach this writable path.
pub struct ApprovedOperation {
    proposal_id: String,
    digest: String,
    canonical: Vec<u8>,
    pub(crate) authority: Authority,
}
impl ApprovedOperation {
    pub fn proposal_id(&self) -> &str {
        &self.proposal_id
    }
    pub fn digest(&self) -> &str {
        &self.digest
    }
    pub fn canonical_bytes(&self) -> &[u8] {
        &self.canonical
    }
}
#[derive(Default)]
pub(crate) struct ReviewBook {
    entries: HashMap<String, Entry>,
    history: VecDeque<ProposalSummary>,
    consumed: HashSet<String>,
    active: Option<ReviewLease>,
}
impl ReviewBook {
    fn retire(&mut self, id: &str, state: ProposalState) {
        if let Some(mut entry) = self.entries.remove(id) {
            entry.state = state;
            self.history.push_back(entry.summary());
            while self.history.len() > 64 {
                self.history.pop_front();
            }
        }
        if self.active.as_ref().is_some_and(|a| a.0.proposal_id == id) {
            if let Some(lease) = self.active.take() {
                lease.finish(match state {
                    ProposalState::Expired => 3,
                    ProposalState::Stale => 4,
                    _ => 2,
                });
            }
        }
    }
    fn sweep(&mut self) {
        let expired: Vec<_> = self
            .entries
            .iter()
            .filter(|(_, e)| Instant::now() >= e.deadline)
            .map(|(id, _)| id.clone())
            .collect();
        for id in expired {
            self.retire(&id, ProposalState::Expired)
        }
        if let Some(a) = &self.active {
            let reason = a.0.reason.load(Ordering::Acquire);
            if reason != 0 {
                let id = a.0.proposal_id.clone();
                self.retire(
                    &id,
                    match reason {
                        3 => ProposalState::Expired,
                        4 => ProposalState::Stale,
                        _ => ProposalState::Denied,
                    },
                );
            }
        }
    }
    pub(crate) fn invalidate(&mut self) {
        let ids: Vec<_> = self.entries.keys().cloned().collect();
        for id in ids {
            self.retire(&id, ProposalState::Stale)
        }
    }
    #[cfg(test)]
    pub(crate) fn propose(
        &mut self,
        scope: ReviewScope,
        op: ProposalInput,
    ) -> Result<ProposalSummary, HostError> {
        self.propose_prepared(
            format!("local-proposal-{}", random_id()?),
            scope,
            op,
            None,
            Instant::now() + REVIEW_LIFETIME,
        )
    }
    pub(crate) fn propose_prepared(
        &mut self,
        id: String,
        scope: ReviewScope,
        op: ProposalInput,
        pre: Option<FilePrecondition>,
        deadline: Instant,
    ) -> Result<ProposalSummary, HostError> {
        self.sweep();
        op.validate()?;
        if scope.grant_id != op.grant_id() {
            return Err(HostError::GrantDenied);
        }
        if self.entries.len() >= MAX_PENDING {
            return Err(HostError::ProposalCapacity);
        }
        if self.entries.contains_key(&id) || self.consumed.contains(&id) {
            return Err(HostError::RandomUnavailable);
        }
        if deadline <= Instant::now()
            || pre.as_ref().is_some_and(|p| !p.valid_for(&op))
            || matches!(op, ProposalInput::WriteText { .. }) && pre.is_none()
        {
            return Err(HostError::ProposalInvalid);
        }
        let entry = Entry {
            digest: digest(&canonical_prepared(&id, &scope, &op, pre.as_ref())),
            id: id.clone(),
            scope,
            op,
            deadline,
            state: ProposalState::Pending,
            displayed: false,
            precondition: pre,
        };
        entry.document()?;
        let summary = entry.summary();
        self.entries.insert(id, entry);
        Ok(summary)
    }
    pub(crate) fn candidate(&self, id: &str) -> Result<ProposalInput, HostError> {
        self.entries
            .get(id)
            .map(|e| e.op.clone())
            .ok_or(HostError::ProposalUnknown)
    }
    pub(crate) fn status(&mut self, id: &str) -> Result<ProposalSummary, HostError> {
        self.sweep();
        self.entries
            .get(id)
            .map(Entry::summary)
            .or_else(|| {
                self.history
                    .iter()
                    .rev()
                    .find(|s| s.proposal_id == id)
                    .cloned()
            })
            .ok_or(HostError::ProposalUnknown)
    }
    pub(crate) fn cancel(&mut self, id: &str) -> Result<(), HostError> {
        self.sweep();
        if !self.entries.contains_key(id) {
            if self.history.iter().any(|s| {
                s.proposal_id == id
                    && matches!(
                        s.status,
                        ProposalState::Denied | ProposalState::Expired | ProposalState::Stale
                    )
            }) {
                return Ok(());
            }
            return Err(HostError::ProposalUnknown);
        }
        self.retire(id, ProposalState::Denied);
        Ok(())
    }
    pub(crate) fn begin(
        &mut self,
        id: &str,
        scope: &ReviewScope,
    ) -> Result<ReviewLease, HostError> {
        self.sweep();
        if self.active.is_some() {
            return Err(HostError::Busy);
        }
        let e = self.entries.get_mut(id).ok_or(HostError::ProposalUnknown)?;
        if &e.scope != scope || e.state != ProposalState::Pending {
            return Err(HostError::ReviewDenied);
        }
        let (changed, _) = watch::channel(0);
        let lease = ReviewLease(Arc::new(LeaseInner {
            proposal_id: id.into(),
            label: format!("native-review-{}", random_id()?),
            deadline: e.deadline,
            reason: AtomicU8::new(0),
            changed,
        }));
        e.state = ProposalState::Reviewing;
        self.active = Some(lease.clone());
        Ok(lease)
    }
    fn check(&mut self, lease: &ReviewLease, scope: &ReviewScope) -> Result<&mut Entry, HostError> {
        self.sweep();
        if !lease.is_active()
            || !self
                .active
                .as_ref()
                .is_some_and(|a| Arc::ptr_eq(&a.0, &lease.0))
        {
            return Err(HostError::ReviewDenied);
        }
        let e = self
            .entries
            .get_mut(&lease.0.proposal_id)
            .ok_or(HostError::ProposalUnknown)?;
        if &e.scope != scope || e.state != ProposalState::Reviewing {
            return Err(HostError::ReviewDenied);
        }
        Ok(e)
    }
    pub(crate) fn document(
        &mut self,
        lease: &ReviewLease,
        scope: &ReviewScope,
    ) -> Result<ReviewDocument, HostError> {
        self.check(lease, scope)?.document()
    }
    pub(crate) fn displayed(
        &mut self,
        lease: &ReviewLease,
        scope: &ReviewScope,
        id: &str,
        digest: &str,
    ) -> Result<(), HostError> {
        let e = self.check(lease, scope)?;
        if e.id != id || e.digest != digest || e.displayed {
            lease.deny();
            return Err(HostError::ReviewDenied);
        }
        e.displayed = true;
        Ok(())
    }
    pub(crate) fn decide(
        &mut self,
        lease: &ReviewLease,
        scope: &ReviewScope,
        id: &str,
        digest: &str,
        decision: Decision,
    ) -> Result<(), HostError> {
        let e = self.check(lease, scope)?;
        if e.id != id || e.digest != digest {
            lease.deny();
            return Err(HostError::ReviewDenied);
        }
        if matches!(decision, Decision::Deny) {
            self.retire(id, ProposalState::Denied);
            return Ok(());
        }
        if !e.displayed {
            lease.deny();
            return Err(HostError::ReviewDenied);
        }
        if !lease.finish(1) {
            return Err(HostError::ReviewDenied);
        }
        e.state = ProposalState::Accepted;
        self.active = None;
        Ok(())
    }
    pub(crate) fn consume(
        &mut self,
        id: &str,
        scope: &ReviewScope,
        candidate: ProposalInput,
    ) -> Result<ApprovedOperation, HostError> {
        self.sweep();
        if let Err(error) = candidate.validate() {
            self.retire(id, ProposalState::Stale);
            return Err(error);
        }
        let e = self.entries.get(id).ok_or(HostError::ProposalUnknown)?;
        if e.state != ProposalState::Accepted
            || &e.scope != scope
            || candidate.grant_id() != scope.grant_id
            || digest(&canonical_prepared(
                id,
                scope,
                &candidate,
                e.precondition.as_ref(),
            )) != e.digest
        {
            self.retire(id, ProposalState::Stale);
            return Err(HostError::ReviewDenied);
        }
        if scope.read_only {
            return Err(HostError::WriteGrantRequired);
        }
        if self.consumed.len() >= MAX_ATTEMPTS {
            return Err(HostError::ProposalCapacity);
        }
        if !self.consumed.insert(id.into()) {
            return Err(HostError::ReviewDenied);
        }
        let output = ApprovedOperation {
            proposal_id: id.into(),
            digest: e.digest.clone(),
            canonical: canonical_prepared(id, scope, &e.op, e.precondition.as_ref()),
            authority: scope.authority.clone(),
        };
        self.retire(id, ProposalState::Consumed);
        Ok(output)
    }
}

impl RpcSession {
    pub(crate) fn invalidate_reviews(&self) {
        if let Ok(mut book) = self.reviews.lock() {
            book.invalidate();
        }
    }
    pub(crate) fn review_scope(
        &self,
        grants: &GrantState,
        grant_id: &str,
    ) -> Result<ReviewScope, HostError> {
        self.ensure_workspace()?;
        let grant = grants
            .review_grant(grant_id)
            .ok_or(HostError::GrantDenied)?;
        Ok(ReviewScope {
            authority: self
                .authority
                .get()
                .ok_or(HostError::Closed)?
                .with_grant_revision(grants.revision),
            grant_id: grant.grant_id,
            display_root: grant.display_path,
            read_only: grant.read_only,
        })
    }
    pub async fn propose_operation(
        &self,
        input: ProposalInput,
    ) -> Result<ProposalSummary, HostError> {
        let grants = self.grants.try_read().map_err(|_| HostError::Busy)?;
        let scope = self.review_scope(&grants, input.grant_id())?;
        input.validate()?;
        let _permit = self.permits.try_acquire().map_err(|_| HostError::Busy)?;
        let id = format!("local-proposal-{}", random_id()?);
        let deadline = Instant::now() + REVIEW_LIFETIME;
        let reply = self
            .request_authority(
                "native_prepare_mutation",
                serde_json::json!({"proposal_id":id,"operation":input}),
                Some(&scope.authority),
            )
            .await?;
        let prepared: PreparedMutation =
            serde_json::from_value(reply).map_err(|_| HostError::InvalidResponse)?;
        self.ensure_workspace()?;
        prepared.verify(&id, &scope, &input)?;
        let result = self
            .reviews
            .lock()
            .map_err(|_| HostError::StateUnavailable)?
            .propose_prepared(
                id.clone(),
                scope.clone(),
                input,
                Some(prepared.material.precondition),
                deadline,
            );
        if result.is_err() {
            let _ = self
                .request_authority(
                    "native_cancel_mutation",
                    serde_json::json!({"proposal_id":id}),
                    Some(&scope.authority),
                )
                .await;
        }
        result
    }
    pub async fn proposal_status(&self, id: &str) -> Result<ProposalSummary, HostError> {
        self.ensure_workspace()?;
        self.reviews
            .lock()
            .map_err(|_| HostError::StateUnavailable)?
            .status(id)
    }
    pub async fn cancel_proposal(&self, id: &str) -> Result<(), HostError> {
        self.ensure_workspace()?;
        let grants = self.grants.try_read().map_err(|_| HostError::Busy)?;
        let authority = self
            .authority
            .get()
            .ok_or(HostError::Closed)?
            .with_grant_revision(grants.revision);
        self.reviews
            .lock()
            .map_err(|_| HostError::StateUnavailable)?
            .cancel(id)?;
        // Local denial is final even if best-effort remote ticket cleanup fails.
        let _ = self
            .request_authority(
                "native_cancel_mutation",
                serde_json::json!({"proposal_id":id}),
                Some(&authority),
            )
            .await;
        Ok(())
    }
    pub async fn begin_review(&self, id: &str) -> Result<ReviewLease, HostError> {
        let grants = self.grants.try_read().map_err(|_| HostError::Busy)?;
        self.ensure_workspace()?;
        let mut book = self
            .reviews
            .lock()
            .map_err(|_| HostError::StateUnavailable)?;
        let summary = book.status(id)?;
        let scope = self.review_scope(&grants, &summary.grant_id)?;
        book.begin(id, &scope)
    }
    pub async fn review_document(&self, lease: &ReviewLease) -> Result<ReviewDocument, HostError> {
        let grants = self.grants.try_read().map_err(|_| HostError::Busy)?;
        self.ensure_workspace()?;
        let mut book = self
            .reviews
            .lock()
            .map_err(|_| HostError::StateUnavailable)?;
        let summary = book.status(&lease.0.proposal_id)?;
        let scope = self.review_scope(&grants, &summary.grant_id)?;
        book.document(lease, &scope)
    }
    pub async fn acknowledge_review(
        &self,
        lease: &ReviewLease,
        input: DisplayAcknowledgement,
    ) -> Result<(), HostError> {
        let grants = self.grants.try_read().map_err(|_| HostError::Busy)?;
        self.ensure_workspace()?;
        let mut book = self
            .reviews
            .lock()
            .map_err(|_| HostError::StateUnavailable)?;
        let summary = book.status(&lease.0.proposal_id)?;
        let scope = self.review_scope(&grants, &summary.grant_id)?;
        book.displayed(lease, &scope, &input.proposal_id, &input.digest)
    }
    pub async fn decide_review(
        &self,
        lease: &ReviewLease,
        input: ReviewDecision,
    ) -> Result<(), HostError> {
        let grants = self.grants.try_read().map_err(|_| HostError::Busy)?;
        self.ensure_workspace()?;
        let mut book = self
            .reviews
            .lock()
            .map_err(|_| HostError::StateUnavailable)?;
        let summary = book.status(&lease.0.proposal_id)?;
        let scope = self.review_scope(&grants, &summary.grant_id)?;
        book.decide(
            lease,
            &scope,
            &input.proposal_id,
            &input.digest,
            input.decision,
        )
    }
    /// Native-only consumption boundary; no matching Tauri command exists.
    pub async fn consume_approval(
        &self,
        id: &str,
        candidate: ProposalInput,
    ) -> Result<ApprovedOperation, HostError> {
        let grants = self.grants.try_read().map_err(|_| HostError::Busy)?;
        let scope = self.review_scope(&grants, candidate.grant_id())?;
        self.reviews
            .lock()
            .map_err(|_| HostError::StateUnavailable)?
            .consume(id, &scope, candidate)
    }
}
