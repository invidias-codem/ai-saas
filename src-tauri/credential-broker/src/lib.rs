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
#[serde(rename_all = "camelCase")]
pub struct CredentialRef {
    pub id: String,
    pub label: String,
    pub created_at: String, // ISO8601
    pub updated_at: String, // ISO8601
    pub metadata: HashMap<String, String>,
}

/// Credential metadata returned to callers — no secret material.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
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

/// Trait for platform-specific credential storage.
#[async_trait::async_trait]
trait CredentialStore: Send + Sync {
    async fn get(&self, key: &str) -> Result<Option<Zeroizing<String>>>;
    async fn set(&self, key: &str, value: &str) -> Result<()>;
    async fn remove(&self, key: &str) -> Result<()>;
    async fn list(&self, prefix: &str) -> Result<Vec<String>>;
    async fn exists(&self, key: &str) -> Result<bool>;
}

// Platform-specific store implementations.

#[cfg(all(target_os = "macos", not(all(test, feature = "test-store"))))]
mod macos {
    use super::*;
    use security_framework::item::{ItemClass, ItemSearchOptions, Limit};
    use security_framework::passwords::{
        delete_generic_password, get_generic_password, set_generic_password,
    };
    use security_framework_sys::base::errSecItemNotFound;

    pub struct MacOSStore;

    #[async_trait::async_trait]
    impl CredentialStore for MacOSStore {
        async fn get(&self, key: &str) -> Result<Option<Zeroizing<String>>> {
            match get_generic_password(SERVICE_NAME, key) {
                Ok(password) => {
                    let secret = String::from_utf8(password)
                        .map_err(|e| CredentialError::InvalidData(e.to_string()))?;
                    Ok(Some(Zeroizing::new(secret)))
                }
                Err(error) if error.code() == errSecItemNotFound => Ok(None),
                Err(e) => Err(CredentialError::Platform(e.to_string())),
            }
        }

        async fn set(&self, key: &str, value: &str) -> Result<()> {
            set_generic_password(SERVICE_NAME, key, value.as_bytes())
                .map_err(|e| CredentialError::Platform(e.to_string()))?;
            Ok(())
        }

        async fn remove(&self, key: &str) -> Result<()> {
            delete_generic_password(SERVICE_NAME, key)
                .map_err(|e| CredentialError::Platform(e.to_string()))?;
            Ok(())
        }

        async fn list(&self, prefix: &str) -> Result<Vec<String>> {
            let items = match ItemSearchOptions::new()
                .class(ItemClass::generic_password())
                .service(SERVICE_NAME)
                .load_attributes(true)
                .limit(Limit::All)
                .search()
            {
                Ok(items) => items,
                Err(error) if error.code() == errSecItemNotFound => return Ok(vec![]),
                Err(error) => return Err(CredentialError::Platform(error.to_string())),
            };
            let mut keys = Vec::new();
            for item in items {
                // Apple's kSecAttrAccount dictionary key is "acct".
                let key = item
                    .simplify_dict()
                    .and_then(|mut attrs| attrs.remove("acct"))
                    .ok_or_else(|| {
                        CredentialError::InvalidData("Keychain account is missing".into())
                    })?;
                if key.starts_with(prefix) {
                    keys.push(key);
                }
            }
            Ok(keys)
        }

        async fn exists(&self, key: &str) -> Result<bool> {
            Ok(self.get(key).await?.is_some())
        }
    }
}

#[cfg(all(target_os = "windows", not(all(test, feature = "test-store"))))]
mod windows {
    use super::*;
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Foundation::{GetLastError, ERROR_NOT_FOUND};
    use windows_sys::Win32::Security::Credentials::{
        CredDeleteW, CredEnumerateW, CredFree, CredReadW, CredWriteW, CREDENTIALW,
        CRED_PERSIST_LOCAL_MACHINE, CRED_TYPE_GENERIC,
    };

    fn to_wide(s: &str) -> Vec<u16> {
        OsStr::new(s).encode_wide().chain(Some(0)).collect()
    }

    fn from_wide(w: &[u16]) -> String {
        String::from_utf16_lossy(w)
            .trim_end_matches('\0')
            .to_string()
    }

    pub struct WindowsStore;

    struct CredentialAllocation(*const std::ffi::c_void);

    impl Drop for CredentialAllocation {
        fn drop(&mut self) {
            if !self.0.is_null() {
                unsafe {
                    CredFree(self.0);
                }
            }
        }
    }

    #[async_trait::async_trait]
    impl CredentialStore for WindowsStore {
        async fn get(&self, key: &str) -> Result<Option<Zeroizing<String>>> {
            let target = to_wide(&format!("{}/{}", SERVICE_NAME, key));
            let mut cred_ptr = std::ptr::null_mut();
            unsafe {
                let result = CredReadW(target.as_ptr(), CRED_TYPE_GENERIC, 0, &mut cred_ptr);
                if result == 0 {
                    let error = GetLastError();
                    if error == ERROR_NOT_FOUND {
                        return Ok(None);
                    }
                    return Err(CredentialError::Platform(format!(
                        "CredReadW failed: {}",
                        error
                    )));
                }
                if cred_ptr.is_null() {
                    return Err(CredentialError::Platform(
                        "CredReadW returned no credential".into(),
                    ));
                }
                let _allocation = CredentialAllocation(cred_ptr.cast());
                let cred = &*cred_ptr;
                let secret = if cred.CredentialBlobSize > 0 {
                    if cred.CredentialBlob.is_null() || cred.CredentialBlobSize % 2 != 0 {
                        return Err(CredentialError::InvalidData(
                            "Invalid Windows credential blob".into(),
                        ));
                    }
                    // CredentialBlob is a byte buffer, not necessarily aligned for u16.
                    let bytes = std::slice::from_raw_parts(
                        cred.CredentialBlob,
                        cred.CredentialBlobSize as usize,
                    );
                    let wide = Zeroizing::new(
                        bytes
                            .as_chunks::<2>()
                            .0
                            .iter()
                            .map(|pair| u16::from_le_bytes(*pair))
                            .collect::<Vec<_>>(),
                    );
                    let mut secret = String::from_utf16(&wide).map_err(|_| {
                        CredentialError::InvalidData("Invalid Windows credential encoding".into())
                    })?;
                    while secret.ends_with('\0') {
                        secret.pop();
                    }
                    secret
                } else {
                    String::new()
                };
                Ok(Some(Zeroizing::new(secret)))
            }
        }

        async fn set(&self, key: &str, value: &str) -> Result<()> {
            let mut target = to_wide(&format!("{}/{}", SERVICE_NAME, key));
            let value_wide = Zeroizing::new(to_wide(value));
            let cred = CREDENTIALW {
                Type: CRED_TYPE_GENERIC,
                TargetName: target.as_mut_ptr(),
                CredentialBlobSize: (value_wide.len() * 2) as u32,
                CredentialBlob: value_wide.as_ptr() as *mut u8,
                Persist: CRED_PERSIST_LOCAL_MACHINE,
                ..Default::default()
            };
            unsafe {
                let result = CredWriteW(&cred, 0);
                if result == 0 {
                    return Err(CredentialError::Platform(format!(
                        "CredWriteW failed: {}",
                        GetLastError()
                    )));
                }
            }
            Ok(())
        }

        async fn remove(&self, key: &str) -> Result<()> {
            let target = to_wide(&format!("{}/{}", SERVICE_NAME, key));
            unsafe {
                let result = CredDeleteW(target.as_ptr(), CRED_TYPE_GENERIC, 0);
                if result == 0 {
                    return Err(CredentialError::Platform(format!(
                        "CredDeleteW failed: {}",
                        GetLastError()
                    )));
                }
            }
            Ok(())
        }

        async fn list(&self, prefix: &str) -> Result<Vec<String>> {
            let filter = to_wide(&format!("{}/{}*", SERVICE_NAME, prefix));
            let mut cred_ptr = std::ptr::null_mut();
            let mut count = 0u32;
            let mut results = Vec::new();
            unsafe {
                let result = CredEnumerateW(filter.as_ptr(), 0, &mut count, &mut cred_ptr);
                if result == 0 {
                    let error = GetLastError();
                    if error == ERROR_NOT_FOUND {
                        return Ok(vec![]);
                    }
                    return Err(CredentialError::Platform(format!(
                        "CredEnumerateW failed: {error}"
                    )));
                }
                let _allocation = CredentialAllocation(cred_ptr.cast());
                if count > 0 && cred_ptr.is_null() {
                    return Err(CredentialError::Platform(
                        "CredEnumerateW returned no credentials".into(),
                    ));
                }
                if count > 0 && !cred_ptr.is_null() {
                    let creds = std::slice::from_raw_parts(cred_ptr, count as usize);
                    for cred_ptr in creds {
                        if !cred_ptr.is_null() {
                            let cred = &**cred_ptr;
                            if cred.TargetName.is_null() {
                                return Err(CredentialError::InvalidData(
                                    "Windows credential target is missing".into(),
                                ));
                            }
                            let target = from_wide(std::slice::from_raw_parts(
                                cred.TargetName,
                                (0..).take_while(|&i| *cred.TargetName.add(i) != 0).count(),
                            ));
                            if let Some(key) = target.strip_prefix(&format!("{}/", SERVICE_NAME)) {
                                results.push(key.to_string());
                            }
                        }
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

#[cfg(all(unix, not(target_os = "macos"), not(all(test, feature = "test-store"))))]
mod linux {
    use super::*;
    use secret_service::{Collection, EncryptionType, SecretService};
    use tokio::sync::OnceCell;

    pub struct LinuxStore {
        service: OnceCell<SecretService<'static>>,
    }

    impl LinuxStore {
        pub fn new() -> Self {
            Self {
                service: OnceCell::new(),
            }
        }

        async fn get_collection(&self) -> Result<Collection<'_>> {
            // The workspace can start without a keyring. Every credential access
            // still requires Secret Service and fails explicitly if it is unavailable.
            let service = self
                .service
                .get_or_try_init(|| async {
                    SecretService::connect(EncryptionType::Dh)
                        .await
                        .map_err(|error| CredentialError::StoreUnavailable(error.to_string()))
                })
                .await?;
            let collection = service
                .get_default_collection()
                .await
                .map_err(|e| CredentialError::StoreUnavailable(e.to_string()))?;
            collection
                .unlock()
                .await
                .map_err(|e| CredentialError::StoreUnavailable(e.to_string()))?;
            Ok(collection)
        }

        fn make_attributes<'b>(&self, key: &'b str) -> HashMap<&'b str, &'b str> {
            let mut attrs = HashMap::new();
            attrs.insert("service", SERVICE_NAME);
            attrs.insert("key", key);
            attrs.insert("application", "lattice-os");
            attrs
        }
    }

    #[async_trait::async_trait]
    impl CredentialStore for LinuxStore {
        async fn get(&self, key: &str) -> Result<Option<Zeroizing<String>>> {
            let attrs = self.make_attributes(key);
            let collection = self.get_collection().await?;
            match collection.search_items(attrs).await {
                Ok(items) => {
                    if let Some(item) = items.first() {
                        let secret_bytes = item
                            .get_secret()
                            .await
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
            let collection = self.get_collection().await?;
            collection
                .create_item(
                    &label,
                    attrs,
                    value.as_bytes(),
                    true,
                    "application/octet-stream",
                )
                .await
                .map_err(|e| CredentialError::Platform(e.to_string()))?;
            Ok(())
        }

        async fn remove(&self, key: &str) -> Result<()> {
            let attrs = self.make_attributes(key);
            let collection = self.get_collection().await?;
            let items = collection
                .search_items(attrs)
                .await
                .map_err(|e| CredentialError::Platform(e.to_string()))?;
            for item in items {
                item.delete()
                    .await
                    .map_err(|e| CredentialError::Platform(e.to_string()))?;
            }
            Ok(())
        }

        async fn list(&self, prefix: &str) -> Result<Vec<String>> {
            let mut attrs = HashMap::new();
            attrs.insert("service", SERVICE_NAME);
            attrs.insert("application", "lattice-os");
            let collection = self.get_collection().await?;
            let items = collection
                .search_items(attrs)
                .await
                .map_err(|e| CredentialError::Platform(e.to_string()))?;
            let mut results = Vec::new();
            for item in items {
                let item_attrs = item
                    .get_attributes()
                    .await
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

/// In-memory storage is available only in explicit unit-test builds.
#[cfg(all(test, feature = "test-store"))]
mod fallback {
    use super::*;
    use std::sync::Mutex;

    pub struct FallbackStore {
        map: Mutex<HashMap<String, Zeroizing<String>>>,
    }

    impl FallbackStore {
        pub fn new() -> Self {
            Self {
                map: Mutex::new(HashMap::new()),
            }
        }
    }

    #[async_trait::async_trait]
    impl CredentialStore for FallbackStore {
        async fn get(&self, key: &str) -> Result<Option<Zeroizing<String>>> {
            Ok(self.map.lock().unwrap().get(key).cloned())
        }

        async fn set(&self, key: &str, value: &str) -> Result<()> {
            self.map
                .lock()
                .unwrap()
                .insert(key.into(), Zeroizing::new(value.into()));
            Ok(())
        }

        async fn remove(&self, key: &str) -> Result<()> {
            self.map.lock().unwrap().remove(key);
            Ok(())
        }

        async fn list(&self, prefix: &str) -> Result<Vec<String>> {
            Ok(self
                .map
                .lock()
                .unwrap()
                .keys()
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
}

impl CredentialBroker {
    pub async fn new() -> Result<Self> {
        let store: Box<dyn CredentialStore> = {
            #[cfg(all(target_os = "macos", not(all(test, feature = "test-store"))))]
            {
                Box::new(macos::MacOSStore)
            }
            #[cfg(all(target_os = "windows", not(all(test, feature = "test-store"))))]
            {
                Box::new(windows::WindowsStore)
            }
            #[cfg(all(unix, not(target_os = "macos"), not(all(test, feature = "test-store"))))]
            {
                Box::new(linux::LinuxStore::new())
            }
            #[cfg(all(test, feature = "test-store"))]
            {
                Box::new(fallback::FallbackStore::new())
            }
            #[cfg(not(any(
                target_os = "macos",
                target_os = "windows",
                all(unix, not(target_os = "macos")),
                all(test, feature = "test-store")
            )))]
            {
                return Err(CredentialError::StoreUnavailable(
                    "Unsupported platform".into(),
                ));
            }
        };
        Ok(Self { store })
    }

    /// Generate a storage key from provider + kind + optional suffix.
    fn storage_key(
        &self,
        provider: ProviderKind,
        kind: CredentialKind,
        suffix: Option<&str>,
    ) -> String {
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
            return Err(CredentialError::InvalidData(
                "Secret cannot be empty".into(),
            ));
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
            return Err(CredentialError::InvalidData(
                "Secret cannot be empty".into(),
            ));
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
            last_verified: if exists {
                Some(chrono::Utc::now().to_rfc3339())
            } else {
                None
            },
        })
    }

    /// Retrieve a local endpoint configuration (endpoint_url and model_id).
    /// Returns the config parsed from the stored secret.
    pub async fn get_local_endpoint(&self, provider: ProviderKind) -> Result<(String, String)> {
        self.get_local_endpoint_with_suffix(provider, None).await
    }

    /// Retrieve a local endpoint configuration with optional suffix.
    pub async fn get_local_endpoint_with_suffix(
        &self,
        provider: ProviderKind,
        suffix: Option<&str>,
    ) -> Result<(String, String)> {
        let key = self.storage_key(provider, CredentialKind::LocalEndpoint, suffix);
        let secret = self
            .store
            .get(&key)
            .await?
            .ok_or(CredentialError::NotFound(key))?;
        let parts: Vec<&str> = secret.split('|').collect();
        if parts.len() != 2 {
            return Err(CredentialError::InvalidData(
                "Invalid local endpoint format".into(),
            ));
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
    pub async fn list_provider_credentials(
        &self,
        provider: ProviderKind,
    ) -> Result<Vec<CredentialRef>> {
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
        provider: ProviderKind,
        kind: CredentialKind,
        suffix: Option<&str>,
    ) -> Result<bool> {
        // Verification is provider-specific and done at the adapter layer.
        // The broker only confirms the credential exists in storage.
        self.store
            .exists(&self.storage_key(provider, kind, suffix))
            .await
    }
}

/// Tauri command types for the broker.
#[derive(Debug, Serialize, Deserialize)]
#[serde(
    tag = "action",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum BrokerCommand {
    StoreApiKey {
        provider: ProviderKind,
        api_key: String,
        label: String,
        metadata: Option<HashMap<String, String>>,
        suffix: Option<String>,
    },
    UpdateApiKey {
        provider: ProviderKind,
        api_key: String,
        suffix: Option<String>,
    },
    GetApiKeyStatus {
        provider: ProviderKind,
        suffix: Option<String>,
    },
    DeleteApiKey {
        provider: ProviderKind,
        suffix: Option<String>,
    },
    ListProviderCredentials {
        provider: ProviderKind,
    },
    StoreRefreshToken {
        provider: ProviderKind,
        token: String,
        label: String,
        suffix: Option<String>,
    },
    GetRefreshTokenStatus {
        provider: ProviderKind,
        suffix: Option<String>,
    },
    DeleteRefreshToken {
        provider: ProviderKind,
        suffix: Option<String>,
    },
    StoreLocalEndpoint {
        provider: ProviderKind,
        endpoint_url: String,
        model_id: String,
        label: String,
        suffix: Option<String>,
    },
    GetLocalEndpointStatus {
        provider: ProviderKind,
        suffix: Option<String>,
    },
    GetLocalEndpoint {
        provider: ProviderKind,
        suffix: Option<String>,
    },
    DeleteLocalEndpoint {
        provider: ProviderKind,
        suffix: Option<String>,
    },
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(
    tag = "status",
    rename_all = "lowercase",
    rename_all_fields = "camelCase"
)]
pub enum BrokerResponse {
    Ok {
        reference: CredentialRef,
    },
    Status {
        status_value: CredentialStatus,
    },
    Config {
        endpoint_url: String,
        model_id: String,
    },
    List {
        credentials: Vec<CredentialRef>,
    },
    Deleted,
    Error {
        code: String,
        message: String,
    },
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
            }
            .into(),
            message: err.to_string(),
        }
    }
}

impl CredentialBroker {
    pub async fn handle_command(&self, cmd: BrokerCommand) -> BrokerResponse {
        use BrokerCommand::*;
        use BrokerResponse::*;

        match cmd {
            StoreApiKey {
                provider,
                api_key,
                label,
                metadata,
                suffix,
            } => {
                match self
                    .store_credential(
                        provider,
                        CredentialKind::ApiKey,
                        &api_key,
                        &label,
                        metadata,
                        suffix.as_deref(),
                    )
                    .await
                {
                    Ok(r) => Ok { reference: r },
                    Err(e) => e.into(),
                }
            }
            UpdateApiKey {
                provider,
                api_key,
                suffix,
            } => {
                match self
                    .update_credential(
                        provider,
                        CredentialKind::ApiKey,
                        &api_key,
                        suffix.as_deref(),
                    )
                    .await
                {
                    Ok(r) => Ok { reference: r },
                    Err(e) => e.into(),
                }
            }
            GetApiKeyStatus { provider, suffix } => {
                match self
                    .get_status(provider, CredentialKind::ApiKey, suffix.as_deref())
                    .await
                {
                    Ok(s) => Status { status_value: s },
                    Err(e) => e.into(),
                }
            }
            DeleteApiKey { provider, suffix } => {
                match self
                    .delete_credential(provider, CredentialKind::ApiKey, suffix.as_deref())
                    .await
                {
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
            StoreRefreshToken {
                provider,
                token,
                label,
                suffix,
            } => {
                match self
                    .store_credential(
                        provider,
                        CredentialKind::RefreshToken,
                        &token,
                        &label,
                        None,
                        suffix.as_deref(),
                    )
                    .await
                {
                    Ok(r) => Ok { reference: r },
                    Err(e) => e.into(),
                }
            }
            GetRefreshTokenStatus { provider, suffix } => {
                match self
                    .get_status(provider, CredentialKind::RefreshToken, suffix.as_deref())
                    .await
                {
                    Ok(s) => Status { status_value: s },
                    Err(e) => e.into(),
                }
            }
            DeleteRefreshToken { provider, suffix } => {
                match self
                    .delete_credential(provider, CredentialKind::RefreshToken, suffix.as_deref())
                    .await
                {
                    Ok(_) => Deleted,
                    Err(e) => e.into(),
                }
            }
            StoreLocalEndpoint {
                provider,
                endpoint_url,
                model_id,
                label,
                suffix,
            } => {
                // Store endpoint config as the secret (not a secret, but configuration that needs retrieval)
                // Do NOT put sensitive URL params in metadata
                match self
                    .store_credential(
                        provider,
                        CredentialKind::LocalEndpoint,
                        &format!("{}|{}", endpoint_url, model_id),
                        &label,
                        None,
                        suffix.as_deref(),
                    )
                    .await
                {
                    Ok(r) => Ok { reference: r },
                    Err(e) => e.into(),
                }
            }
            GetLocalEndpointStatus { provider, suffix } => {
                match self
                    .get_status(provider, CredentialKind::LocalEndpoint, suffix.as_deref())
                    .await
                {
                    Ok(s) => Status { status_value: s },
                    Err(e) => e.into(),
                }
            }
            GetLocalEndpoint { provider, suffix } => {
                match self
                    .get_local_endpoint_with_suffix(provider, suffix.as_deref())
                    .await
                {
                    Ok((endpoint_url, model_id)) => Config {
                        endpoint_url,
                        model_id,
                    },
                    Err(e) => e.into(),
                }
            }
            DeleteLocalEndpoint { provider, suffix } => {
                match self
                    .delete_credential(provider, CredentialKind::LocalEndpoint, suffix.as_deref())
                    .await
                {
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

#[cfg(all(test, feature = "test-store"))]
mod tests;

#[cfg(all(
    test,
    not(feature = "test-store"),
    any(target_os = "windows", target_os = "macos")
))]
mod os_tests;
