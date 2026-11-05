//! Provider routing through the credential broker (Slice 1 integration).
//!
//! This module handles:
//! - Resolving provider connections from profile config
//! - Fetching credentials from the OS-protected credential broker
//! - Routing inference requests to the appropriate provider
//! - Handling provider-specific configurations

use crate::ProviderConnectionStatus;
use crate::ProviderKind;
use lattice_credential_broker::{
    CredentialBroker, CredentialKind, CredentialRef, ProviderKind as BrokerProviderKind,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, SystemTime};
use thiserror::Error;
use tokio::sync::RwLock;
use tracing::{debug, info, warn};

/// Provider routing errors.
#[derive(Debug, Error)]
pub enum ProviderRouterError {
    #[error("Provider not configured: {0}")]
    NotConfigured(String),
    #[error("Credential not found: {0}")]
    CredentialNotFound(String),
    #[error("Credential error: {0}")]
    Credential(#[from] crate::CredentialError),
    #[error("Invalid provider config: {0}")]
    InvalidConfig(String),
    #[error("Provider unavailable: {0}")]
    Unavailable(String),
    #[error("Authentication failed: {0}")]
    AuthenticationFailed(String),
    #[error("Rate limited: retry after {retry_after_ms}ms")]
    RateLimited { retry_after_ms: u64 },
    #[error("Model not available: {0}")]
    ModelNotAvailable(String),
    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
}

pub type ProviderResult<T> = std::result::Result<T, ProviderRouterError>;

/// Provider router — resolves credentials and routes requests.
pub struct ProviderRouter {
    credential_broker: Arc<CredentialBroker>,
    profile_path: PathBuf,
    provider_cache: RwLock<HashMap<String, CachedProvider>>,
    default_connection: RwLock<Option<String>>,
}

/// Cached provider info with credentials.
#[derive(Debug, Clone)]
struct CachedProvider {
    connection_id: String,
    provider_kind: BrokerProviderKind,
    config: ProviderConfig,
    api_key_ref: Option<CredentialRef>,
    refresh_token_ref: Option<CredentialRef>,
    local_endpoint_ref: Option<CredentialRef>,
    cached_at: SystemTime,
    ttl: Duration,
}

/// Provider configuration from profile.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum ProviderConfig {
    #[serde(rename = "nvidia-nim-managed")]
    NvidiaNimManaged {
        workspace_id: Option<String>,
        entitlements: Option<Vec<String>>,
    },
    #[serde(rename = "nvidia-nim-personal")]
    NvidiaNimPersonal {
        base_url: Option<String>,
        model_id: Option<String>,
    },
    #[serde(rename = "openai")]
    OpenAI {
        base_url: Option<String>,
        organization_id: Option<String>,
        model_id: Option<String>,
    },
    #[serde(rename = "anthropic")]
    Anthropic {
        base_url: Option<String>,
        model_id: Option<String>,
    },
    #[serde(rename = "google")]
    Google {
        base_url: Option<String>,
        model_id: Option<String>,
    },
    #[serde(rename = "openrouter")]
    OpenRouter {
        base_url: Option<String>,
        model_id: Option<String>,
        referer: Option<String>,
        title: Option<String>,
    },
    #[serde(rename = "huggingface")]
    HuggingFace {
        base_url: Option<String>,
        model_id: Option<String>,
    },
    #[serde(rename = "local")]
    LocalEndpoint {
        endpoint_url: String,
        model_id: String,
        compatible_models: Option<Vec<String>>,
        strict_local_mode: bool,
    },
}

impl ProviderConfig {
    /// Get the provider kind from the config.
    pub fn kind(&self) -> BrokerProviderKind {
        match self {
            Self::NvidiaNimManaged { .. } => BrokerProviderKind::NvidiaNimManaged,
            Self::NvidiaNimPersonal { .. } => BrokerProviderKind::NvidiaNimPersonal,
            Self::OpenAI { .. } => BrokerProviderKind::OpenAI,
            Self::Anthropic { .. } => BrokerProviderKind::Anthropic,
            Self::Google { .. } => BrokerProviderKind::Google,
            Self::OpenRouter { .. } => BrokerProviderKind::OpenRouter,
            Self::HuggingFace { .. } => BrokerProviderKind::HuggingFace,
            Self::LocalEndpoint { .. } => BrokerProviderKind::Local,
        }
    }

    /// Get the base URL for the provider.
    pub fn base_url(&self) -> Option<String> {
        match self {
            Self::NvidiaNimManaged { .. } => None, // Uses gateway
            Self::NvidiaNimPersonal { base_url, .. } => base_url.clone(),
            Self::OpenAI { base_url, .. } => base_url.clone(),
            Self::Anthropic { base_url, .. } => base_url.clone(),
            Self::Google { base_url, .. } => base_url.clone(),
            Self::OpenRouter { base_url, .. } => base_url.clone(),
            Self::HuggingFace { base_url, .. } => base_url.clone(),
            Self::LocalEndpoint { endpoint_url, .. } => Some(endpoint_url.clone()),
        }
    }

    /// Get the default model ID.
    pub fn model_id(&self) -> Option<String> {
        match self {
            Self::NvidiaNimManaged { .. } => None,
            Self::NvidiaNimPersonal { model_id, .. } => model_id.clone(),
            Self::OpenAI { model_id, .. } => model_id.clone(),
            Self::Anthropic { model_id, .. } => model_id.clone(),
            Self::Google { model_id, .. } => model_id.clone(),
            Self::OpenRouter { model_id, .. } => model_id.clone(),
            Self::HuggingFace { model_id, .. } => model_id.clone(),
            Self::LocalEndpoint { model_id, .. } => Some(model_id.clone()),
        }
    }
}

/// Provider connection from profile settings.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderConnection {
    pub id: String,
    pub kind: BrokerProviderKind,
    pub label: String,
    pub is_default: bool,
    pub credentials: Vec<CredentialRef>,
    pub config: ProviderConfig,
    pub created_at: String,
    pub updated_at: String,
}

/// Provider router response for status.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderStatus {
    pub connection_id: String,
    pub provider_kind: BrokerProviderKind,
    pub status: ProviderConnectionStatus,
    pub is_default: bool,
    pub label: String,
    pub last_check: SystemTime,
    pub latency_ms: Option<u64>,
}

impl ProviderRouter {
    /// Create a new provider router.
    pub async fn new(
        credential_broker: Arc<CredentialBroker>,
        profile_path: PathBuf,
    ) -> ProviderResult<Self> {
        Ok(Self {
            credential_broker,
            profile_path,
            provider_cache: RwLock::new(HashMap::new()),
            default_connection: RwLock::new(None),
        })
    }

    /// Load provider connections from profile config.
    pub async fn load_connections(&self) -> ProviderResult<Vec<ProviderConnection>> {
        let config_path = self.profile_path.join("config.json");
        if !config_path.exists() {
            return Ok(vec![]);
        }

        let content = tokio::fs::read_to_string(&config_path).await?;
        let settings: serde_json::Value = serde_json::from_str(&content)?;

        let connections = settings
            .get("connections")
            .and_then(|c| c.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| serde_json::from_value(v.clone()).ok())
                    .collect::<Vec<ProviderConnection>>()
            })
            .unwrap_or_default();

        // Update default connection
        if let Some(default_id) = settings.get("defaultConnectionId").and_then(|v| v.as_str()) {
            *self.default_connection.write().await = Some(default_id.to_string());
        }

        // Cache providers
        let mut cache = self.provider_cache.write().await;
        for conn in &connections {
            self.cache_provider(conn, &mut cache).await?;
        }

        Ok(connections)
    }

    /// Cache a provider connection.
    async fn cache_provider(
        &self,
        conn: &ProviderConnection,
        cache: &mut HashMap<String, CachedProvider>,
    ) -> ProviderResult<()> {
        // Find API key credential
        let api_key_ref = conn
            .credentials
            .iter()
            .find(|c| {
                // In a real implementation, we'd check the credential kind
                c.metadata.get("kind") == Some(&"api-key".to_string())
            })
            .cloned();

        // Find refresh token credential
        let refresh_token_ref = conn
            .credentials
            .iter()
            .find(|c| c.metadata.get("kind") == Some(&"refresh-token".to_string()))
            .cloned();

        // Find local endpoint credential
        let local_endpoint_ref = conn
            .credentials
            .iter()
            .find(|c| c.metadata.get("kind") == Some(&"local-endpoint".to_string()))
            .cloned();

        let cached = CachedProvider {
            connection_id: conn.id.clone(),
            provider_kind: conn.kind,
            config: conn.config.clone(),
            api_key_ref,
            refresh_token_ref,
            local_endpoint_ref,
            cached_at: SystemTime::now(),
            ttl: Duration::from_secs(300), // 5 min cache
        };

        cache.insert(conn.id.clone(), cached);
        Ok(())
    }

    /// Get the default provider connection ID.
    pub async fn get_default_connection(&self) -> Option<String> {
        self.default_connection.read().await.clone()
    }

    /// Set the default provider connection.
    pub async fn set_default_connection(&self, connection_id: String) -> ProviderResult<()> {
        // Verify connection exists
        if self
            .provider_cache
            .read()
            .await
            .contains_key(&connection_id)
        {
            *self.default_connection.write().await = Some(connection_id);
            // TODO: persist to profile config
            Ok(())
        } else {
            Err(ProviderRouterError::NotConfigured(connection_id))
        }
    }

    /// Get API key for a provider connection.
    pub async fn get_api_key(&self, connection_id: &str) -> ProviderResult<Option<String>> {
        let cache = self.provider_cache.read().await;
        let provider = cache
            .get(connection_id)
            .ok_or_else(|| ProviderRouterError::NotConfigured(connection_id.to_string()))?;

        if let Some(ref cred_ref) = provider.api_key_ref {
            // Get the actual secret from the credential broker
            let key = format!(
                "{}:api-key:{}",
                provider.provider_kind.as_str(),
                connection_id
            );
            let secret = self
                .credential_broker
                .get(&key)
                .await?
                .ok_or_else(|| ProviderRouterError::CredentialNotFound(key))?;
            Ok(Some(secret.to_string()))
        } else {
            Ok(None)
        }
    }

    /// Get refresh token for a provider connection.
    pub async fn get_refresh_token(&self, connection_id: &str) -> ProviderResult<Option<String>> {
        let cache = self.provider_cache.read().await;
        let provider = cache
            .get(connection_id)
            .ok_or_else(|| ProviderRouterError::NotConfigured(connection_id.to_string()))?;

        if let Some(ref cred_ref) = provider.refresh_token_ref {
            let key = format!(
                "{}:refresh-token:{}",
                provider.provider_kind.as_str(),
                connection_id
            );
            let secret = self
                .credential_broker
                .get(&key)
                .await?
                .ok_or_else(|| ProviderRouterError::CredentialNotFound(key))?;
            Ok(Some(secret.to_string()))
        } else {
            Ok(None)
        }
    }

    /// Get local endpoint config for a provider connection.
    pub async fn get_local_endpoint(
        &self,
        connection_id: &str,
    ) -> ProviderResult<Option<(String, String)>> {
        let cache = self.provider_cache.read().await;
        let provider = cache
            .get(connection_id)
            .ok_or_else(|| ProviderRouterError::NotConfigured(connection_id.to_string()))?;

        if let Some(ref cred_ref) = provider.local_endpoint_ref {
            let key = format!(
                "{}:local-endpoint:{}",
                provider.provider_kind.as_str(),
                connection_id
            );
            let secret = self
                .credential_broker
                .get(&key)
                .await?
                .ok_or_else(|| ProviderRouterError::CredentialNotFound(key))?;
            // Secret format: "url|model_id"
            let parts: Vec<&str> = secret.split('|').collect();
            if parts.len() == 2 {
                Ok(Some((parts[0].to_string(), parts[1].to_string())))
            } else {
                Err(ProviderRouterError::InvalidConfig(
                    "Invalid local endpoint format".to_string(),
                ))
            }
        } else {
            Ok(None)
        }
    }

    /// Get provider config for a connection.
    pub async fn get_config(&self, connection_id: &str) -> ProviderResult<ProviderConfig> {
        let cache = self.provider_cache.read().await;
        let provider = cache
            .get(connection_id)
            .ok_or_else(|| ProviderRouterError::NotConfigured(connection_id.to_string()))?;
        Ok(provider.config.clone())
    }

    /// Get all provider statuses.
    pub async fn get_all_status(&self) -> ProviderResult<Vec<ProviderStatus>> {
        let connections = self.load_connections().await?;
        let mut statuses = Vec::new();

        for conn in connections {
            // Check credential availability
            let has_api_key = conn
                .credentials
                .iter()
                .any(|c| c.metadata.get("kind") == Some(&"api-key".to_string()));
            let has_refresh = conn
                .credentials
                .iter()
                .any(|c| c.metadata.get("kind") == Some(&"refresh-token".to_string()));
            let has_endpoint = conn
                .credentials
                .iter()
                .any(|c| c.metadata.get("kind") == Some(&"local-endpoint".to_string()));

            let status = if conn.kind == BrokerProviderKind::Local {
                if has_endpoint {
                    ProviderConnectionStatus::Connected
                } else {
                    ProviderConnectionStatus::Disconnected
                }
            } else if has_api_key || has_refresh {
                ProviderConnectionStatus::Connected
            } else {
                ProviderConnectionStatus::Disconnected
            };

            statuses.push(ProviderStatus {
                connection_id: conn.id,
                provider_kind: conn.kind,
                status,
                is_default: conn.is_default,
                label: conn.label,
                last_check: SystemTime::now(),
                latency_ms: None,
            });
        }

        Ok(statuses)
    }

    /// Resolve the active provider for a session.
    pub async fn resolve_provider(
        &self,
        session_connection_id: Option<&str>,
    ) -> ProviderResult<(String, BrokerProviderKind, ProviderConfig, Option<String>)> {
        // Use session connection or default
        let connection_id = session_connection_id
            .map(|s| s.to_string())
            .or_else(|| self.get_default_connection().await)
            .ok_or(ProviderRouterError::NotConfigured(
                "No provider configured".to_string(),
            ))?;

        let config = self.get_config(&connection_id).await?;
        let provider_kind = config.kind();
        let api_key = self.get_api_key(&connection_id).await?;
        let local_endpoint = self.get_local_endpoint(&connection_id).await?;

        // Determine the actual credential to use
        let credential = match (&provider_kind, api_key, local_endpoint) {
            (BrokerProviderKind::Local, _, Some((url, model))) => {
                Some(format!("local:{}:{}", url, model))
            }
            (_, Some(key), _) => Some(key),
            _ => None,
        };

        Ok((connection_id, provider_kind, config, credential))
    }

    /// Invalidate cache for a connection (call after credential changes).
    pub async fn invalidate_cache(&self, connection_id: &str) {
        self.provider_cache.write().await.remove(connection_id);
    }

    /// Check if a provider is available (has valid credentials).
    pub async fn is_available(&self, connection_id: &str) -> bool {
        if let Ok(config) = self.get_config(connection_id).await {
            match config.kind() {
                BrokerProviderKind::Local => self.get_local_endpoint(connection_id).await.is_ok(),
                _ => self.get_api_key(connection_id).await.is_ok(),
            }
        } else {
            false
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::CredentialError;

    #[test]
    fn test_provider_config_kind() {
        let config = ProviderConfig::OpenAI {
            base_url: None,
            organization_id: None,
            model_id: Some("gpt-4".to_string()),
        };
        assert_eq!(config.kind(), BrokerProviderKind::OpenAI);
        assert_eq!(config.model_id(), Some("gpt-4".to_string()));
    }

    #[test]
    fn test_local_endpoint_config() {
        let config = ProviderConfig::LocalEndpoint {
            endpoint_url: "http://localhost:11434".to_string(),
            model_id: "llama3".to_string(),
            compatible_models: None,
            strict_local_mode: true,
        };
        assert_eq!(config.kind(), BrokerProviderKind::Local);
        assert_eq!(
            config.base_url(),
            Some("http://localhost:11434".to_string())
        );
    }
}
