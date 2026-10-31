// Credential broker Tauri integration module.
// Re-exports types and provides Tauri state initialization.

use lattice_credential_broker::{
    BrokerCommand, BrokerResponse as InnerBrokerResponse, CredentialBroker, CredentialKind,
    CredentialRef, CredentialStatus, ProviderKind,
};
use serde::Serialize;
use std::sync::Arc;

#[derive(Serialize)]
#[serde(tag = "status", rename_all = "lowercase")]
pub enum BrokerResponse {
    Ok { reference: CredentialRef },
    Status { status_value: CredentialStatus },
    List { credentials: Vec<CredentialRef> },
    Deleted,
    Error { code: String, message: String },
}

impl From<InnerBrokerResponse> for BrokerResponse {
    fn from(r: InnerBrokerResponse) -> Self {
        match r {
            InnerBrokerResponse::Ok { reference } => BrokerResponse::Ok { reference },
            InnerBrokerResponse::Status { status_value } => BrokerResponse::Status { status_value },
            InnerBrokerResponse::List { credentials } => BrokerResponse::List { credentials },
            InnerBrokerResponse::Deleted => BrokerResponse::Deleted,
            InnerBrokerResponse::Error { code, message } => BrokerResponse::Error { code, message },
        }
    }
}

// Use a local wrapper function instead of foreign-type impl
pub async fn handle_broker_command(
    broker: &CredentialBroker,
    cmd: BrokerCommand,
) -> BrokerResponse {
    broker.handle_command(cmd).await.into()
}

pub async fn init_credential_broker(preview: bool) -> Result<Arc<CredentialBroker>, String> {
    CredentialBroker::new(preview)
        .await
        .map(Arc::new)
        .map_err(|e| e.to_string())
}
