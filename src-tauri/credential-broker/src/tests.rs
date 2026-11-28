use super::*;

#[tokio::test]
async fn references_and_status_never_return_api_keys() {
    let broker = CredentialBroker::new().await.unwrap();
    let secret = "example synthetic credential value";
    let response = broker
        .handle_command(BrokerCommand::StoreApiKey {
            provider: ProviderKind::OpenAI,
            api_key: secret.into(),
            label: "Test connection".into(),
            metadata: None,
            suffix: Some("connection-a".into()),
        })
        .await;
    assert!(matches!(response, BrokerResponse::Ok { .. }));
    assert!(!serde_json::to_string(&response).unwrap().contains(secret));
    let status = broker
        .get_status(
            ProviderKind::OpenAI,
            CredentialKind::ApiKey,
            Some("connection-a"),
        )
        .await
        .unwrap();
    assert!(status.is_valid);
    assert!(!serde_json::to_string(&status).unwrap().contains(secret));
    let wire = serde_json::to_value(BrokerResponse::Status {
        status_value: status,
    })
    .unwrap();
    assert_eq!(wire["statusValue"]["isValid"], true);
    assert!(wire["statusValue"]["reference"]["createdAt"].is_string());
}

#[tokio::test]
async fn deleting_one_connection_keeps_another_connections_secret() {
    let broker = CredentialBroker::new().await.unwrap();
    for suffix in ["connection-a", "connection-b"] {
        broker
            .store_credential(
                ProviderKind::OpenAI,
                CredentialKind::ApiKey,
                "synthetic value",
                suffix,
                None,
                Some(suffix),
            )
            .await
            .unwrap();
    }
    assert_eq!(
        broker
            .list_provider_credentials(ProviderKind::OpenAI)
            .await
            .unwrap()
            .len(),
        2
    );
    broker
        .delete_credential(
            ProviderKind::OpenAI,
            CredentialKind::ApiKey,
            Some("connection-a"),
        )
        .await
        .unwrap();
    assert!(
        !broker
            .get_status(
                ProviderKind::OpenAI,
                CredentialKind::ApiKey,
                Some("connection-a")
            )
            .await
            .unwrap()
            .is_valid
    );
    assert!(
        broker
            .get_status(
                ProviderKind::OpenAI,
                CredentialKind::ApiKey,
                Some("connection-b")
            )
            .await
            .unwrap()
            .is_valid
    );
}

#[tokio::test]
async fn missing_and_empty_credentials_cannot_claim_success() {
    let broker = CredentialBroker::new().await.unwrap();
    assert!(matches!(
        broker
            .store_credential(
                ProviderKind::OpenAI,
                CredentialKind::ApiKey,
                "  ",
                "empty",
                None,
                None
            )
            .await,
        Err(CredentialError::InvalidData(_))
    ));
    assert!(matches!(
        broker
            .update_credential(ProviderKind::OpenAI, CredentialKind::ApiKey, "value", None)
            .await,
        Err(CredentialError::NotFound(_))
    ));
    assert!(!broker
        .verify_credential(ProviderKind::OpenAI, CredentialKind::ApiKey, None)
        .await
        .unwrap());
}

#[tokio::test]
async fn endpoint_configuration_is_retrieved_separately_from_metadata() {
    let broker = CredentialBroker::new().await.unwrap();
    let endpoint = "http://127.0.0.1:8000/v1";
    let response = broker
        .handle_command(BrokerCommand::StoreLocalEndpoint {
            provider: ProviderKind::Local,
            endpoint_url: endpoint.into(),
            model_id: "example-model".into(),
            label: "Local model".into(),
            suffix: Some("local-a".into()),
        })
        .await;
    assert!(matches!(response, BrokerResponse::Ok { .. }));
    assert!(!serde_json::to_string(&response).unwrap().contains(endpoint));
    assert_eq!(
        broker
            .get_local_endpoint_with_suffix(ProviderKind::Local, Some("local-a"))
            .await
            .unwrap(),
        (endpoint.into(), "example-model".into())
    );
    let config = broker
        .handle_command(BrokerCommand::GetLocalEndpoint {
            provider: ProviderKind::Local,
            suffix: Some("local-a".into()),
        })
        .await;
    assert_eq!(
        serde_json::to_value(config).unwrap()["endpointUrl"],
        endpoint
    );
    assert!(matches!(
        broker
            .get_local_endpoint_with_suffix(ProviderKind::Local, Some("local-b"))
            .await,
        Err(CredentialError::NotFound(_))
    ));
}

struct UnavailableStore;

#[async_trait::async_trait]
impl CredentialStore for UnavailableStore {
    async fn get(&self, _: &str) -> Result<Option<Zeroizing<String>>> {
        Err(CredentialError::StoreUnavailable(
            "Test store unavailable".into(),
        ))
    }
    async fn set(&self, _: &str, _: &str) -> Result<()> {
        Err(CredentialError::StoreUnavailable(
            "Test store unavailable".into(),
        ))
    }
    async fn remove(&self, _: &str) -> Result<()> {
        Err(CredentialError::StoreUnavailable(
            "Test store unavailable".into(),
        ))
    }
    async fn list(&self, _: &str) -> Result<Vec<String>> {
        Err(CredentialError::StoreUnavailable(
            "Test store unavailable".into(),
        ))
    }
    async fn exists(&self, _: &str) -> Result<bool> {
        Err(CredentialError::StoreUnavailable(
            "Test store unavailable".into(),
        ))
    }
}

#[tokio::test]
async fn storage_errors_remain_errors_instead_of_empty_lists_or_valid_credentials() {
    let broker = CredentialBroker {
        store: Box::new(UnavailableStore),
    };
    let response = broker
        .handle_command(BrokerCommand::ListProviderCredentials {
            provider: ProviderKind::OpenAI,
        })
        .await;
    assert!(
        matches!(response, BrokerResponse::Error { ref code, .. } if code == "STORE_UNAVAILABLE")
    );
    assert!(broker
        .verify_credential(ProviderKind::OpenAI, CredentialKind::ApiKey, None)
        .await
        .is_err());
    assert!(broker
        .store_credential(
            ProviderKind::OpenAI,
            CredentialKind::ApiKey,
            "synthetic value",
            "test",
            None,
            None
        )
        .await
        .is_err());
}
