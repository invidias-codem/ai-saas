use super::*;

struct Cleanup(String);

impl Drop for Cleanup {
    fn drop(&mut self) {
        #[cfg(target_os = "macos")]
        let _ = security_framework::passwords::delete_generic_password(SERVICE_NAME, &self.0);
        #[cfg(target_os = "windows")]
        {
            let target: Vec<_> = format!("{SERVICE_NAME}/{}", self.0)
                .encode_utf16()
                .chain(Some(0))
                .collect();
            unsafe {
                windows_sys::Win32::Security::Credentials::CredDeleteW(
                    target.as_ptr(),
                    windows_sys::Win32::Security::Credentials::CRED_TYPE_GENERIC,
                    0,
                );
            }
        }
    }
}

#[tokio::test]
async fn native_store_roundtrip_survives_reopening_and_lists_only_matching_keys() {
    let suffix = format!(
        "unit-test-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    );
    let key = format!("openai:api-key:{suffix}");
    let _cleanup = Cleanup(key.clone());
    let broker = CredentialBroker::new().await.unwrap();
    assert!(broker.store.get(&key).await.unwrap().is_none());
    assert!(broker.store.list(&key).await.unwrap().is_empty());
    broker
        .store_credential(
            ProviderKind::OpenAI,
            CredentialKind::ApiKey,
            "synthetic credential ✓",
            "Native test",
            None,
            Some(&suffix),
        )
        .await
        .unwrap();
    let reopened = CredentialBroker::new().await.unwrap();
    assert_eq!(
        reopened
            .store
            .get(&key)
            .await
            .unwrap()
            .as_deref()
            .map(|s| s.as_str()),
        Some("synthetic credential ✓")
    );
    assert_eq!(reopened.store.list(&key).await.unwrap(), vec![key.clone()]);
    reopened
        .update_credential(
            ProviderKind::OpenAI,
            CredentialKind::ApiKey,
            "updated synthetic value",
            Some(&suffix),
        )
        .await
        .unwrap();
    assert_eq!(
        broker
            .store
            .get(&key)
            .await
            .unwrap()
            .as_deref()
            .map(|s| s.as_str()),
        Some("updated synthetic value")
    );
    reopened
        .delete_credential(ProviderKind::OpenAI, CredentialKind::ApiKey, Some(&suffix))
        .await
        .unwrap();
    assert!(broker.store.get(&key).await.unwrap().is_none());
    assert!(broker.store.list(&key).await.unwrap().is_empty());
}
