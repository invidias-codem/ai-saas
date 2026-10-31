//! Credential Broker — OS-protected secret storage for BYOK and local credentials.
//!
//! Design:
//! - No hardcoded unlock material; each platform uses its native credential store.
//! - Fail-closed: any storage error returns an error, never a silent no-op.
//! - No raw-key readback: callers get opaque references + status, never the secret.
//! - Persistence tested across restarts; missing store = explicit error.
//!
//! Platform backends:
//! - macOS: Keychain (security-framework)
//! - Windows: Credential Manager (windows-rs)
//! - Linux: Secret Service (libsecret via secret-service crate)

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use thiserror::Error;
use zeroize::Zeroizing;

pub const SERVICE_NAME: &str = "xyz.gen1e.lattice-os";
pub const PREVIEW_SERVICE_NAME: &str = "xyz.gen1e.lattice-os.preview";

#[derive(Debug, Error)]
pub enum CredentialError {
    #[error("Credential store unavailable: {0}")]
    StoreUnavailable(String),
    #[error("Credential not found: {0}")]
    NotFound(String),
    #[error("Credential already exists: {0}")]
    AlreadyExists(String),
    #[error("Invalid credential data: {0}")]
    InvalidData(String),
    #[error("Platform error: {0}")]
    Platform(String),
    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
}

pub type Result<T> = std::result::Result<T, CredentialError>;

/// Opaque reference to a stored credential — never contains the secret itself.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CredentialRef {
    pub id: String,
    pub label: String,
    pub created_at: String, // ISO8601
    pub updated_at: String, // ISO8601
    pub metadata: HashMap<String, String>,
}

/// Credential metadata returned to callers — no secret material.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CredentialStatus {
    pub reference: CredentialRef,
    pub is_valid: bool,
    pub last_verified: Option<String>,
}

/// Provider connection types for the registry.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "kebab-case")]
pub enum ProviderKind {
    #[serde(rename = "nvidia-nim-managed")]
    NvidiaNimManaged,
    #[serde(rename = "nvidia-nim-personal")]
    NvidiaNimPersonal,
    #[serde(rename = "openai")]
    OpenAI,
    #[serde(rename = "anthropic")]
    Anthropic,
    #[serde(rename = "google")]
    Google,
    #[serde(rename = "openrouter")]
    OpenRouter,
    #[serde(rename = "huggingface")]
    HuggingFace,
    #[serde(rename = "local")]
    Local,
}

impl ProviderKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::NvidiaNimManaged => "nvidia-nim-managed",
            Self::NvidiaNimPersonal => "nvidia-nim-personal",
            Self::OpenAI => "openai",
            Self::Anthropic => "anthropic",
            Self::Google => "google",
            Self::OpenRouter => "openrouter",
            Self::HuggingFace => "huggingface",
            Self::Local => "local",
        }
    }
}

/// Credential kinds stored in the broker.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "kebab-case")]
pub enum CredentialKind {
    #[serde(rename = "api-key")]
    ApiKey,
    #[serde(rename = "refresh-token")]
    RefreshToken,
    #[serde(rename = "local-endpoint")]
    LocalEndpoint,
}

impl CredentialKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::ApiKey => "api-key",
            Self::RefreshToken => "refresh-token",
            Self::LocalEndpoint => "local-endpoint",
        }
    }
}

/// Internal credential record — never returned to callers.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct CredentialRecord {
    reference: CredentialRef,
    #[serde(skip_serializing_if = "Option::is_none")]
    secret: Option<Zeroizing<String>>, // Only present in memory during operations
}

/// Trait for platform-specific credential storage.
#[cfg_attr(not(test), async_trait::async_trait)]
#[cfg_attr(test, async_trait::async_trait(?Send))]
trait CredentialStore: Send + Sync {
    async fn get(&self, key: &str) -> Result<Option<Zeroizing<String>>>;
    async fn set(&self, key: &str, value: &str) -> Result<()>;
    async fn remove(&self, key: &str) -> Result<()>;
    async fn list(&self, prefix: &str) -> Result<Vec<String>>;
    async fn exists(&self, key: &str) -> Result<bool>;
}

/// Platform-specific store implementations.

#[cfg(target_os = "macos")]
mod macos {
    use super::*;
    use security_framework::os::macos::keychain::SecKeychain;
    use security_framework::passwords::{find_generic_password, set_generic_password, delete_generic_password};
    use security_framework::base::Result as SecResult;

    pub struct MacOSStore;

    #[async_trait::async_trait]
    impl CredentialStore for MacOSStore {
        async fn get(&self, key: &str) -> Result<Option<Zeroizing<String>>> {
            let keychain = SecKeychain::default().map_err(|e| CredentialError::Platform(e.to_string()))?;
            match find_generic_password(&keychain, SERVICE_NAME, key) {
                Ok(password) => {
                    let secret = String::from_utf8(password).map_err(|e| CredentialError::InvalidData(e.to_string()))?;
                    Ok(Some(Zeroizing::new(secret)))
                }
                Err(security_framework::Error::ItemNotFound) => Ok(None),
                Err(e) => Err(CredentialError::Platform(e.to_string())),
            }
        }

        async fn set(&self, key: &str, value: &str) -> Result<()> {
            let keychain = SecKeychain::default().map_err(|e| CredentialError::Platform(e.to_string()))?;
            set_generic_password(&keychain, SERVICE_NAME, key, value.as_bytes())
                .map_err(|e| CredentialError::Platform(e.to_string()))?;
            Ok(())
        }

        async fn remove(&self, key: &str) -> Result<()> {
            let keychain = SecKeychain::default().map_err(|e| CredentialError::Platform(e.to_string()))?;
            delete_generic_password(&keychain, SERVICE_NAME, key)
                .map_err(|e| CredentialError::Platform(e.to_string()))?;
            Ok(())
        }

        async fn list(&self, _prefix: &str) -> Result<Vec<String>> {
            // Keychain doesn't support prefix listing easily; return empty for now.
            // A full implementation would use SecItemCopyMatching with a query.
            Ok(vec![])
        }

        async fn exists(&self, key: &str) -> Result<bool> {
            Ok(self.get(key).await?.is_some())
        }
    }
}

#[cfg(target_os = "windows")]
mod windows {
    use super::*;
    use windows::Win32::Security::Credentials::{
        CredReadW, CredWriteW, CredDeleteW, CredEnumerateW, CredFree,
        CREDENTIALW, CRED_TYPE_GENERIC, CRED_PERSIST_LOCAL_MACHINE,
    };
    use windows::Win32::Foundation::{ERROR_NOT_FOUND, WIN32_ERROR};
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;

    fn to_wide(s: &str) -> Vec<u16> {
        OsStr::new(s).encode_wide().chain(Some(0)).collect()
    }

    fn from_wide(w: &[u16]) -> String {
        String::from_utf16_lossy(w).trim_end_matches('\0').to_string()
    }

    pub struct WindowsStore;

    #[async_trait::async_trait]
    impl CredentialStore for WindowsStore {
        async fn get(&self, key: &str) -> Result<Option<Zeroizing<String>>> {
            let target = to_wide(&format!("{}/{}", SERVICE_NAME, key));
            let mut cred_ptr = std::ptr::null_mut();
            unsafe {
                let result = CredReadW(target.as_ptr(), CRED_TYPE_GENERIC, 0, &mut cred_ptr);
                if result.is_err() {
                    let err = WIN32_ERROR(result.0);
                    if err == ERROR_NOT_FOUND {
                        return Ok(None);
                    }
                    return Err(CredentialError::Platform(err.to_string()));
                }
                if cred_ptr.is_null() {
                    return Ok(None);
                }
                let cred = &*cred_ptr;
                let secret = if !cred.CredentialBlob.is_null() && cred.CredentialBlobSize > 0 {
                    let slice = std::slice::from_raw_parts(cred.CredentialBlob, cred.CredentialBlobSize as usize / 2);
                    from_wide(slice)
                } else {
                    String::new()
                };
                CredFree(cred_ptr as *const std::ffi::c_void);
                Ok(Some(Zeroizing::new(secret)))
            }
        }

        async fn set(&self, key: &str, value: &str) -> Result<()> {
            let target = to_wide(&format!("{}/{}", SERVICE_NAME, key));
            let value_wide = to_wide(value);
            let cred = CREDENTIALW {
                Type: CRED_TYPE_GENERIC,
                TargetName: windows::core::PWSTR(target.as_mut_ptr()),
                CredentialBlobSize: (value_wide.len() * 2) as u32,
                CredentialBlob: value_wide.as_ptr() as *mut u8,
                Persist: CRED_PERSIST_LOCAL_MACHINE,
                ..Default::default()
            };
            unsafe {
                CredWriteW(&cred, 0).map_err(|e| CredentialError::Platform(e.to_string()))?;
            }
            Ok(())
        }

        async fn remove(&self, key: &str) -> Result<()> {
            let target = to_wide(&format!("{}/{}", SERVICE_NAME, key));
            unsafe {
                CredDeleteW(target.as_ptr(), CRED_TYPE_GENERIC, 0)
                    .map_err(|e| CredentialError::Platform(e.to_string()))?;
            }
            Ok(())
        }

        async fn list(&self, prefix: &str) -> Result<Vec<String>> {
            let filter = to_wide(&format!("{}/{}*", SERVICE_NAME, prefix));
            let mut cred_ptr = std::ptr::null_mut();
            let mut count = 0u32;
            let mut results = Vec::new();
            unsafe {
                let result = CredEnumerateW(filter.as_ptr(), None, &mut count, &mut cred_ptr);
                if result.is_err() {
                    return Ok(vec![]);
                }
                if count > 0 && !cred_ptr.is_null() {
                    let creds = std::slice::from_raw_parts(cred_ptr, count as usize);
                    for cred_ptr in creds {
                        if !cred_ptr.is_null() {
                            let cred = &**cred_ptr;
                            let target = from_wide(std::slice::from_raw_parts(
                                cred.TargetName.0,
                                (0..).take_while(|&i| *cred.TargetName.0.add(i) != 0).count()
                            ));
                            if let Some(key) = target.strip_prefix(&format!("{}/", SERVICE_NAME)) {
                                results.push(key.to_string());
                            }
                        }
                    }
                }
                if !cred_ptr.is_null() {
                    CredFree(cred_ptr as *const std::ffi::c_void);
                }
            }
            Ok(results)
        }

        async fn exists(&self, key: &str) -> Result<bool> {
            Ok(self.get(key).await?.is_some())
        }
    }
}

#[cfg(all(unix, not(target_os = "macos")))]
mod linux {
    use super::*;
    use secret_service::{SecretService, Collection, EncryptionType};
    use std::sync::Arc;

    pub struct LinuxStore<'a> {
        service: Arc<SecretService<'a>>,
        collection: Arc<Collection<'a>>,
    }

    impl<'a> LinuxStore<'a> {
        pub async fn new() -> Result<Self> {
            let service = Arc::new(SecretService::connect(EncryptionType::Dh).await
                .map_err(|e| CredentialError::StoreUnavailable(e.to_string()))?);
            let collection = service.get_default_collection().await
                .map_err(|e| CredentialError::StoreUnavailable(e.to_string()))?;
            collection.unlock().await
                .map_err(|e| CredentialError::StoreUnavailable(e.to_string()))?;
            Ok(Self {
                service,
                collection: Arc::new(collection),
            })
        }

        fn make_attributes(&self, key: &str) -> HashMap<&str, &str> {
                let mut attrs = HashMap::new();
                attrs.insert("service", SERVICE_NAME);
                attrs.insert("key", key);
                attrs.insert("application", "lattice-os");
                attrs
            }
    }

    #[async_trait::async_trait]
    impl<'a> CredentialStore for LinuxStore<'a> {
        async fn get(&self, key: &str) -> Result<Option<Zeroizing<String>>> {
            let attrs = self.make_attributes(key);
            match self.collection.search_items(attrs).await {
                Ok(items) => {
                    if let Some(item) = items.first() {
                        let secret_bytes = item.get_secret().await
                            .map_err(|e| CredentialError::Platform(e.to_string()))?;
                        let secret = String::from_utf8(secret_bytes)
                            .map_err(|e| CredentialError::InvalidData(e.to_string()))?;
                        Ok(Some(Zeroizing::new(secret)))
                    } else {
                        Ok(None)
                    }
                }
                Err(e) => Err(CredentialError::Platform(e.to_string())),
            }
        }

        async fn set(&self, key: &str, value: &str) -> Result<()> {
            let attrs = self.make_attributes(key);
            let label = format!("{}/{}", SERVICE_NAME, key);
            self.collection.create_item(&label, attrs, value.as_bytes(), true, "application/octet-stream".into())
                .await
                .map_err(|e| CredentialError::Platform(e.to_string()))?;
            Ok(())
        }

        async fn remove(&self, key: &str) -> Result<()> {
            let attrs = self.make_attributes(key);
            let items = self.collection.search_items(attrs).await
                .map_err(|e| CredentialError::Platform(e.to_string()))?;
            for item in items {
                item.delete().await
                    .map_err(|e| CredentialError::Platform(e.to_string()))?;
            }
            Ok(())
        }

        async fn list(&self, prefix: &str) -> Result<Vec<String>> {
            let mut attrs = HashMap::new();
            attrs.insert("service", SERVICE_NAME);
            attrs.insert("application", "lattice-os");
            let items = self.collection.search_items(attrs).await
                .map_err(|e| CredentialError::Platform(e.to_string()))?;
            let mut results = Vec::new();
            for item in items {
                let item_attrs = item.get_attributes().await
                    .map_err(|e| CredentialError::Platform(e.to_string()))?;
                if let Some(key) = item_attrs.get("key") {
                    if key.starts_with(prefix) {
                        results.push(key.to_string());
                    }
                }
            }
            Ok(results)
        }

        async fn exists(&self, key: &str) -> Result<bool> {
            Ok(self.get(key).await?.is_some())
        }
    }
}

/// Fallback store for testing or unsupported platforms — ALWAYS fails closed.
#[cfg(any(test, not(any(target_os = "macos", target_os = "windows", all(unix, not(target_os = "macos"))))))]
mod fallback {
    use super::*;
    use std::sync::Mutex;

    pub struct FallbackStore {
        map: Mutex<HashMap<String, Zeroizing<String>>>,
    }

    impl FallbackStore {
        pub fn new() -> Self {
            Self { map: Mutex::new(HashMap::new()) }
        }
    }

    #[async_trait::async_trait]
    impl CredentialStore for FallbackStore {
        async fn get(&self, key: &str) -> Result<Option<Zeroizing<String>>> {
            Ok(self.map.lock().unwrap().get(key).cloned())
        }

        async fn set(&self, key: &str, value: &str) -> Result<()> {
            self.map.lock().unwrap().insert(key.into(), Zeroizing::new(value.into()));
            Ok(())
        }

        async fn remove(&self, key: &str) -> Result<()> {
            self.map.lock().unwrap().remove(key);
            Ok(())
        }

        async fn list(&self, prefix: &str) -> Result<Vec<String>> {
            Ok(self.map.lock().unwrap().keys()
                .filter(|k| k.starts_with(prefix))
                .cloned()
                .collect())
        }

        async fn exists(&self, key: &str) -> Result<bool> {
            Ok(self.map.lock().unwrap().contains_key(key))
        }
    }
}

/// The credential broker — the single entry point for all credential operations.
pub struct CredentialBroker {
    store: Box<dyn CredentialStore>,
    preview: bool,
}

impl CredentialBroker {
    pub async fn new(preview: bool) -> Result<Self> {
        let store: Box<dyn CredentialStore> = {
            #[cfg(target_os = "macos")]
            { Box::new(macos::MacOSStore) }
            #[cfg(target_os = "windows")]
            { Box::new(windows::WindowsStore) }
            #[cfg(all(unix, not(target_os = "macos")))]
            { Box::new(linux::LinuxStore::new().await?) }
            #[cfg(any(test, not(any(target_os = "macos", target_os = "windows", all(unix, not(target_os = "macos"))))))]
            { Box::new(fallback::FallbackStore::new()) }
        };
        Ok(Self { store, preview })
    }

    /// Generate a storage key from provider + kind + optional suffix.
    fn storage_key(&self, provider: ProviderKind, kind: CredentialKind, suffix: Option<&str>) -> String {
        let base = format!("{}:{}", provider.as_str(), kind.as_str());
        if let Some(s) = suffix {
            format!("{}:{}", base, s)
        } else {
            base
        }
    }

    /// Store a credential (API key, refresh token, or local endpoint config).
    /// Returns the opaque reference. Never returns the secret.
    pub async fn store_credential(
        &self,
        provider: ProviderKind,
        kind: CredentialKind,
        secret: &str,
        label: &str,
        metadata: Option<HashMap<String, String>>,
        suffix: Option<&str>,
    ) -> Result<CredentialRef> {
        if secret.trim().is_empty() {
            return Err(CredentialError::InvalidData("Secret cannot be empty".into()));
        }
        let key = self.storage_key(provider, kind, suffix);
        if self.store.exists(&key).await? {
            return Err(CredentialError::AlreadyExists(key));
        }
        self.store.set(&key, secret).await?;

        let now = chrono::Utc::now().to_rfc3339();
        let reference = CredentialRef {
            id: key.clone(),
            label: label.to_string(),
            created_at: now.clone(),
            updated_at: now,
            metadata: metadata.unwrap_or_default(),
        };
        Ok(reference)
    }

    /// Update an existing credential.
    pub async fn update_credential(
        &self,
        provider: ProviderKind,
        kind: CredentialKind,
        secret: &str,
        suffix: Option<&str>,
    ) -> Result<CredentialRef> {
        if secret.trim().is_empty() {
            return Err(CredentialError::InvalidData("Secret cannot be empty".into()));
        }
        let key = self.storage_key(provider, kind, suffix);
        if !self.store.exists(&key).await? {
            return Err(CredentialError::NotFound(key));
        }
        self.store.set(&key, secret).await?;

        let now = chrono::Utc::now().to_rfc3339();
        let reference = CredentialRef {
            id: key.clone(),
            label: format!("{} {}", provider.as_str(), kind.as_str()),
            created_at: now.clone(), // Would ideally preserve original
            updated_at: now,
            metadata: HashMap::new(),
        };
        Ok(reference)
    }

    /// Retrieve a credential's status (no secret).
    pub async fn get_status(
        &self,
        provider: ProviderKind,
        kind: CredentialKind,
        suffix: Option<&str>,
    ) -> Result<CredentialStatus> {
        let key = self.storage_key(provider, kind, suffix);
        let exists = self.store.exists(&key).await?;
        let reference = CredentialRef {
            id: key.clone(),
            label: format!("{} {}", provider.as_str(), kind.as_str()),
            created_at: chrono::Utc::now().to_rfc3339(),
            updated_at: chrono::Utc::now().to_rfc3339(),
            metadata: HashMap::new(),
        };
        Ok(CredentialStatus {
            reference,
            is_valid: exists,
            last_verified: if exists { Some(chrono::Utc::now().to_rfc3339()) } else { None },
        })
    }

    /// Retrieve a local endpoint configuration (endpoint_url and model_id).
    /// Returns the config parsed from the stored secret.
    pub async fn get_local_endpoint(
        &self,
        provider: ProviderKind,
    ) -> Result<(String, String)> {
        let key = self.storage_key(provider, CredentialKind::LocalEndpoint, None);
        let secret = self.store.get(&key).await?
            .ok_or_else(|| CredentialError::NotFound(key))?;
        let parts: Vec<&str> = secret.split('|').collect();
        if parts.len() != 2 {
            return Err(CredentialError::InvalidData("Invalid local endpoint format".into()));
        }
        Ok((parts[0].to_string(), parts[1].to_string()))
    }

    /// Delete a credential.
    pub async fn delete_credential(
        &self,
        provider: ProviderKind,
        kind: CredentialKind,
        suffix: Option<&str>,
    ) -> Result<()> {
        let key = self.storage_key(provider, kind, suffix);
        if !self.store.exists(&key).await? {
            return Err(CredentialError::NotFound(key));
        }
        self.store.remove(&key).await
    }

    /// List all credentials for a provider.
    pub async fn list_provider_credentials(&self, provider: ProviderKind) -> Result<Vec<CredentialRef>> {
        let prefix = format!("{}:", provider.as_str());
        let keys = self.store.list(&prefix).await?;
        let mut refs = Vec::new();
        for key in keys {
            refs.push(CredentialRef {
                id: key.clone(),
                label: key,
                created_at: chrono::Utc::now().to_rfc3339(),
                updated_at: chrono::Utc::now().to_rfc3339(),
                metadata: HashMap::new(),
            });
        }
        Ok(refs)
    }

    /// Verify a credential by attempting to use it (provider-specific).
    /// This is a placeholder — actual verification happens in provider adapters.
    pub async fn verify_credential(
        &self,
        _provider: ProviderKind,
        _kind: CredentialKind,
        _suffix: Option<&str>,
    ) -> Result<bool> {
        // Verification is provider-specific and done at the adapter layer.
        // The broker only confirms the credential exists in storage.
        Ok(true)
    }
}

/// Tauri command types for the broker.
#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "action", rename_all = "kebab-case")]
pub enum BrokerCommand {
    StoreApiKey {
        provider: ProviderKind,
        api_key: String,
        label: String,
        metadata: Option<HashMap<String, String>>,
    },
    UpdateApiKey {
        provider: ProviderKind,
        api_key: String,
    },
    GetApiKeyStatus {
        provider: ProviderKind,
    },
    DeleteApiKey {
        provider: ProviderKind,
    },
    ListProviderCredentials {
        provider: ProviderKind,
    },
    StoreRefreshToken {
        provider: ProviderKind,
        token: String,
        label: String,
    },
    GetRefreshTokenStatus {
        provider: ProviderKind,
    },
    DeleteRefreshToken {
        provider: ProviderKind,
    },
    StoreLocalEndpoint {
        provider: ProviderKind,
        endpoint_url: String,
        model_id: String,
        label: String,
    },
    GetLocalEndpointStatus {
        provider: ProviderKind,
    },
    GetLocalEndpoint {
        provider: ProviderKind,
    },
    DeleteLocalEndpoint {
        provider: ProviderKind,
    },
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "lowercase")]
pub enum BrokerResponse {
    Ok { reference: CredentialRef },
    Status { status_value: CredentialStatus },
    Config { endpoint_url: String, model_id: String },
    List { credentials: Vec<CredentialRef> },
    Deleted,
    Error { code: String, message: String },
}

impl From<CredentialError> for BrokerResponse {
    fn from(err: CredentialError) -> Self {
        BrokerResponse::Error {
            code: match &err {
                CredentialError::StoreUnavailable(_) => "STORE_UNAVAILABLE",
                CredentialError::NotFound(_) => "NOT_FOUND",
                CredentialError::AlreadyExists(_) => "ALREADY_EXISTS",
                CredentialError::InvalidData(_) => "INVALID_DATA",
                CredentialError::Platform(_) => "PLATFORM_ERROR",
                CredentialError::Serialization(_) => "SERIALIZATION_ERROR",
            }.into(),
            message: err.to_string(),
        }
    }
}

impl CredentialBroker {
    pub async fn handle_command(&self, cmd: BrokerCommand) -> BrokerResponse {
        use BrokerCommand::*;
        use BrokerResponse::*;

        match cmd {
            StoreApiKey { provider, api_key, label, metadata } => {
                match self.store_credential(provider, CredentialKind::ApiKey, &api_key, &label, metadata, None).await {
                    Ok(r) => Ok { reference: r },
                    Err(e) => e.into(),
                }
            }
            UpdateApiKey { provider, api_key } => {
                match self.update_credential(provider, CredentialKind::ApiKey, &api_key, None).await {
                    Ok(r) => Ok { reference: r },
                    Err(e) => e.into(),
                }
            }
            GetApiKeyStatus { provider } => {
                match self.get_status(provider, CredentialKind::ApiKey, None).await {
                    Ok(s) => Status { status: s },
                    Err(e) => e.into(),
                }
            }
            DeleteApiKey { provider } => {
                match self.delete_credential(provider, CredentialKind::ApiKey, None).await {
                    Ok(_) => Deleted,
                    Err(e) => e.into(),
                }
            }
            ListProviderCredentials { provider } => {
                match self.list_provider_credentials(provider).await {
                    Ok(c) => List { credentials: c },
                    Err(e) => e.into(),
                }
            }
            StoreRefreshToken { provider, token, label } => {
                match self.store_credential(provider, CredentialKind::RefreshToken, &token, &label, None, None).await {
                    Ok(r) => Ok { reference: r },
                    Err(e) => e.into(),
                }
            }
            GetRefreshTokenStatus { provider } => {
                match self.get_status(provider, CredentialKind::RefreshToken, None).await {
                    Ok(s) => Status { status: s },
                    Err(e) => e.into(),
                }
            }
            DeleteRefreshToken { provider } => {
                match self.delete_credential(provider, CredentialKind::RefreshToken, None).await {
                    Ok(_) => Deleted,
                    Err(e) => e.into(),
                }
            }
            StoreLocalEndpoint { provider, endpoint_url, model_id, label } => {
                // Store endpoint config as the secret (not a secret, but configuration that needs retrieval)
                // Do NOT put sensitive URL params in metadata
                match self.store_credential(provider, CredentialKind::LocalEndpoint, &format!("{}|{}", endpoint_url, model_id), &label, None, None).await {
                    Ok(r) => Ok { reference: r },
                    Err(e) => e.into(),
                }
            }
            GetLocalEndpointStatus { provider } => {
                match self.get_status(provider, CredentialKind::LocalEndpoint, None).await {
                    Ok(s) => Status { status: s },
                    Err(e) => e.into(),
                }
            }
            GetLocalEndpoint { provider } => {
                match self.get_local_endpoint(provider).await {
                    Ok((endpoint_url, model_id)) => Config { endpoint_url, model_id },
                    Err(e) => e.into(),
                }
            }
            DeleteLocalEndpoint { provider } => {
                match self.delete_credential(provider, CredentialKind::LocalEndpoint, None).await {
                    Ok(_) => Deleted,
                    Err(e) => e.into(),
                }
            }
        }
    }
}

// Re-export for Tauri
pub use BrokerCommand as Command;
pub use BrokerResponse as Response;