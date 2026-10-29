//! Trusted prepared targets and owned one-attempt dispatch. None of these
//! methods is registered as a Tauri command before native UI qualification.
use crate::{
    authority::Authority,
    review::{canonical_prepared, digest, ProposalInput, ReviewScope},
    workspace::MAX_TEXT_BYTES,
    HostError, RpcSession,
};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};
use tokio::{
    sync::{oneshot, Semaphore},
    time::Duration,
};

#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ObjectIdentity {
    pub(crate) volume: String,
    pub(crate) file: String,
}
fn hex(value: &str, len: usize) -> bool {
    value.len() == len
        && value
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}
impl ObjectIdentity {
    fn valid(&self) -> bool {
        hex(&self.volume, 16)
            && (hex(&self.file, 16) || hex(&self.file, 32))
            && self.file.bytes().any(|b| b != b'0')
    }
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct FileBase {
    pub(crate) identity: ObjectIdentity,
    pub(crate) content_sha3: String,
    pub(crate) byte_count: usize,
    pub(crate) content: String,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct FilePrecondition {
    pub(crate) parent_identity: ObjectIdentity,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) base: Option<FileBase>,
}
impl FilePrecondition {
    pub(crate) fn valid_for(&self, op: &ProposalInput) -> bool {
        if !self.parent_identity.valid() {
            return false;
        }
        match (op, &self.base) {
            (ProposalInput::WriteText { .. }, Some(b)) => {
                b.identity.valid()
                    && b.byte_count == b.content.len()
                    && b.byte_count <= MAX_TEXT_BYTES
                    && !b.content.contains('\0')
                    && b.content_sha3 == digest(b.content.as_bytes())
            }
            (ProposalInput::CreateFile { .. } | ProposalInput::CreateDirectory { .. }, None) => {
                true
            }
            _ => false,
        }
    }
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ProposalMaterial {
    pub(crate) proposal_id: String,
    authority: Authority,
    display_root: String,
    read_only: bool,
    ttl_ms: u32,
    operation: ProposalInput,
    pub(crate) precondition: FilePrecondition,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct PreparedMutation {
    pub(crate) material: ProposalMaterial,
    pub(crate) digest: String,
}
impl PreparedMutation {
    pub(crate) fn verify(
        &self,
        id: &str,
        scope: &ReviewScope,
        input: &ProposalInput,
    ) -> Result<(), HostError> {
        let p = &self.material;
        if p.proposal_id != id
            || p.authority != scope.authority
            || p.display_root != scope.display_root
            || p.read_only != scope.read_only
            || p.ttl_ms != 300000
            || p.operation != *input
            || !p.precondition.valid_for(input)
            || self.digest != digest(&canonical_prepared(id, scope, input, Some(&p.precondition)))
        {
            return Err(HostError::InvalidResponse);
        };
        Ok(())
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OperationState {
    Running,
    Succeeded,
    Conflict,
    Denied,
    Cancelled,
    OutcomeUnknown,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OperationStatus {
    pub proposal_id: String,
    pub digest: String,
    pub status: OperationState,
    pub code: String,
    pub may_have_changed: bool,
}
impl OperationStatus {
    fn unknown(id: &str, digest: &str) -> Self {
        Self {
            proposal_id: id.into(),
            digest: digest.into(),
            status: OperationState::OutcomeUnknown,
            code: "LOCAL_OUTCOME_UNKNOWN".into(),
            may_have_changed: true,
        }
    }
    fn valid(&self, id: &str, digest: &str) -> bool {
        if self.proposal_id != id || self.digest != digest {
            return false;
        }
        match self.status {
            OperationState::Running => self.code.is_empty() && !self.may_have_changed,
            OperationState::Succeeded => self.code.is_empty() && self.may_have_changed,
            OperationState::Conflict => {
                self.code == "LOCAL_FILE_CONFLICT" && !self.may_have_changed
            }
            OperationState::Cancelled => {
                self.code == "LOCAL_OPERATION_CANCELLED" && !self.may_have_changed
            }
            OperationState::OutcomeUnknown => {
                self.code == "LOCAL_OUTCOME_UNKNOWN" && self.may_have_changed
            }
            OperationState::Denied => {
                !self.may_have_changed
                    && matches!(
                        self.code.as_str(),
                        "LOCAL_GRANT_DENIED"
                            | "LOCAL_WRITE_GRANT_REQUIRED"
                            | "LOCAL_WORKSPACE_BLOCKED"
                            | "LOCAL_REVIEW_DENIED"
                            | "LOCAL_OPERATION_REPLAYED"
                            | "LOCAL_PROPOSAL_UNAVAILABLE"
                            | "LOCAL_PROPOSAL_CAPACITY"
                            | "LOCAL_OPERATION_BUSY"
                    )
            }
        }
    }
    fn observed_terminal(&self) -> bool {
        !matches!(
            self.status,
            OperationState::Running | OperationState::OutcomeUnknown
        )
    }
}
pub(crate) struct MutationBook {
    slot: Arc<Semaphore>,
    results: Mutex<HashMap<String, OperationStatus>>,
}
impl Default for MutationBook {
    fn default() -> Self {
        Self {
            slot: Arc::new(Semaphore::new(1)),
            results: Mutex::new(HashMap::new()),
        }
    }
}
impl MutationBook {
    fn update(&self, status: OperationStatus) -> Result<OperationStatus, HostError> {
        let mut results = self
            .results
            .lock()
            .map_err(|_| HostError::StateUnavailable)?;
        if let Some(old) = results.get(&status.proposal_id) {
            if old.observed_terminal() {
                return Ok(old.clone());
            }
        }
        results.insert(status.proposal_id.clone(), status.clone());
        Ok(status)
    }
}
fn definite_denial(error: HostError) -> bool {
    matches!(
        error,
        HostError::GrantDenied
            | HostError::WriteGrantRequired
            | HostError::WorkspaceBlocked
            | HostError::ReviewDenied
            | HostError::OperationReplayed
            | HostError::ProposalUnknown
            | HostError::ProposalCapacity
            | HostError::Busy
    )
}

impl RpcSession {
    /// Consume immutable native acceptance and spawn ownership before awaiting
    /// the response. A disappearing caller cannot cancel or repeat this attempt.
    pub async fn dispatch_operation(
        self: &Arc<Self>,
        id: &str,
    ) -> Result<OperationStatus, HostError> {
        self.ensure_workspace()?;
        let permit = self
            .mutations
            .slot
            .clone()
            .try_acquire_owned()
            .map_err(|_| HostError::Busy)?;
        let grants = self
            .grants
            .clone()
            .try_read_owned()
            .map_err(|_| HostError::Busy)?;
        let approved = {
            let mut book = self
                .reviews
                .lock()
                .map_err(|_| HostError::StateUnavailable)?;
            let candidate = book.candidate(id)?;
            let scope = self.review_scope(&grants, candidate.grant_id())?;
            book.consume(id, &scope, candidate)?
        };
        let unknown = OperationStatus::unknown(approved.proposal_id(), approved.digest());
        self.mutations.update(unknown.clone())?;
        let session = self.clone();
        let (send, receive) = oneshot::channel();
        tokio::spawn(async move {
            let _permit = permit;
            let _grants = grants;
            let id = approved.proposal_id();
            let digest = approved.digest();
            // This is the only dispatch. Everything below reconciles this ID.
            let response = session
                .request_authority(
                    "native_dispatch_mutation",
                    serde_json::json!({"proposal_id":id,"digest":digest}),
                    Some(&approved.authority),
                )
                .await;
            let mut observed = false;
            let initial = match response {
                Ok(value) => match serde_json::from_value::<OperationStatus>(value) {
                    Ok(status) if status.valid(id, digest) => {
                        observed = true;
                        status
                    }
                    _ => unknown.clone(),
                },
                Err(error) if definite_denial(error) => OperationStatus {
                    proposal_id: id.into(),
                    digest: digest.into(),
                    status: OperationState::Denied,
                    code: match error {
                        HostError::Busy => "LOCAL_OPERATION_BUSY",
                        _ => error.code(),
                    }
                    .into(),
                    may_have_changed: false,
                },
                _ => unknown.clone(),
            };
            let initial = session.mutations.update(initial).unwrap_or(unknown);
            let done = initial.observed_terminal()
                || observed && initial.status == OperationState::OutcomeUnknown;
            let _ = send.send(initial);
            if done {
                return;
            }
            let mut closed = session.closed.subscribe();
            loop {
                if *closed.borrow() {
                    break;
                }
                tokio::select! {_=closed.changed()=>break,_=tokio::time::sleep(Duration::from_millis(100))=>{}}
                let response = session
                    .request_authority(
                        "native_mutation_status",
                        serde_json::json!({"proposal_id":id}),
                        Some(&approved.authority),
                    )
                    .await;
                if let Ok(value) = response {
                    if let Ok(status) = serde_json::from_value::<OperationStatus>(value) {
                        if status.valid(id, digest) {
                            let done = status.status != OperationState::Running;
                            let _ = session.mutations.update(status);
                            if done {
                                break;
                            }
                        }
                    }
                }
            }
        });
        receive.await.map_err(|_| HostError::OutcomeUnknown)
    }
    pub async fn operation_status(&self, id: &str) -> Result<OperationStatus, HostError> {
        self.ensure_workspace()?;
        self.mutations
            .results
            .lock()
            .map_err(|_| HostError::StateUnavailable)?
            .get(id)
            .cloned()
            .ok_or(HostError::OperationUnavailable)
    }
    pub async fn cancel_operation(&self, id: &str) -> Result<OperationStatus, HostError> {
        self.ensure_workspace()?;
        let known = self.operation_status(id).await?;
        if known.observed_terminal() {
            return Ok(known);
        }
        let grants = self.grants.try_read().map_err(|_| HostError::Busy)?;
        let authority = self
            .authority
            .get()
            .ok_or(HostError::Closed)?
            .with_grant_revision(grants.revision);
        let response = self
            .request_authority(
                "native_cancel_mutation",
                serde_json::json!({"proposal_id":id}),
                Some(&authority),
            )
            .await;
        self.ensure_workspace()?;
        let next = response
            .ok()
            .and_then(|v| serde_json::from_value::<OperationStatus>(v).ok())
            .filter(|s| s.valid(id, &known.digest))
            .unwrap_or_else(|| OperationStatus::unknown(id, &known.digest));
        self.mutations.update(next)
    }
}
