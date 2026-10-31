mod credential_broker;
mod native_host;
mod review;
mod workspace;

#[cfg(test)]
mod ipc_tests;
#[cfg(test)]
mod review_test_support;

use chrono::Utc;
use credential_broker::{handle_broker_command, init_credential_broker};
use lattice_credential_broker::{
    BrokerCommand, BrokerResponse as InnerBrokerResponse, CredentialBroker, CredentialKind,
    ProviderKind,
};
use lattice_native_host::lifecycle::{NativeHost, Phase};
use lattice_native_host::{permits_window, TelemetryEvent};
use native_host::TauriLauncher;
use serde::Serialize;
use serde_json::json;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::Manager;

#[derive(Serialize)]
struct HarnessEvent {
    id: String,
    timestamp: String,
    #[serde(rename = "type")]
    event_type: String,
    description: String,
}

fn to_harness_event(event: &TelemetryEvent) -> HarnessEvent {
    use sha2::{Digest, Sha256};
    let id = event
        .id
        .clone()
        .filter(|id| !id.is_empty())
        .unwrap_or_else(|| {
            format!(
                "{:x}",
                Sha256::digest(serde_json::to_vec(event).unwrap_or_default())
            )
        });
    let event_type = if event.event_type.contains("command")
        || event.event_type.contains("delete")
        || event.event_type.contains("move")
    {
        "execution"
    } else if event.event_type.contains("read")
        || event.event_type.contains("stat")
        || event.event_type.contains("list")
        || event.event_type.contains("discover")
    {
        "read"
    } else if event.event_type.contains("sync") || event.event_type.contains("ingest") {
        "sync"
    } else {
        "heartbeat"
    };
    HarnessEvent {
        id,
        timestamp: event.timestamp.clone(),
        event_type: event_type.into(),
        description: format!(
            "{}{}: {}",
            event.event_type,
            event
                .path_accessed
                .as_ref()
                .map(|p| format!(" {p}"))
                .unwrap_or_default(),
            if event.success { "ok" } else { "failed" }
        ),
    }
}

fn require_local_window<R: tauri::Runtime>(window: &tauri::WebviewWindow<R>) -> Result<(), String> {
    let url = window
        .url()
        .map_err(|_| "Local window required".to_string())?;
    if permits_window(window.label(), url.as_str(), cfg!(debug_assertions)) {
        Ok(())
    } else {
        Err("Local window required".into())
    }
}

#[tauri::command]
async fn ping_daemon<R: tauri::Runtime>(
    window: tauri::WebviewWindow<R>,
    state: tauri::State<'_, Arc<NativeHost>>,
) -> Result<serde_json::Value, String> {
    require_local_window(&window)?;
    match state.status().await {
        Ok(Some(status)) => Ok(json!({
            "status": "ok",
            "recent_events": status.events.iter().map(to_harness_event).collect::<Vec<_>>()
        })),
        Ok(None) => Ok(json!({"status":"booting","recent_events":[]})),
        Err(_) if state.phase() == Phase::Stopping => {
            Ok(json!({"status":"stopping","recent_events":[]}))
        }
        Err(_) if state.phase() == Phase::Booting => {
            Ok(json!({"status":"booting","recent_events":[]}))
        }
        Err(error) => Ok(json!({
            "status": if state.phase() == Phase::Stopped { "stopped" } else { "error" },
            "recent_events": [],
            "error": { "code": error.code(), "message": error.message() }
        })),
    }
}

#[tauri::command]
async fn restart_daemon<R: tauri::Runtime>(
    window: tauri::WebviewWindow<R>,
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, Arc<NativeHost>>,
) -> Result<serde_json::Value, String> {
    require_local_window(&window)?;
    match state.restart(TauriLauncher(app)).await {
        Ok(()) => Ok(json!({"status":"ok"})),
        Err(error) => {
            Ok(json!({"status":"error","error":{"code":error.code(),"message":error.message()}}))
        }
    }
}

#[tauri::command]
async fn flush_telemetry<R: tauri::Runtime>(
    window: tauri::WebviewWindow<R>,
) -> Result<serde_json::Value, String> {
    require_local_window(&window)?;
    // Existing frontend trigger only; no generic native RPC or cloud credential.
    Ok(json!({"status":"trigger_ok"}))
}

// Credential Broker commands

#[tauri::command]
async fn credential_store_api_key<R: tauri::Runtime>(
    window: tauri::WebviewWindow<R>,
    state: tauri::State<'_, Arc<CredentialBroker>>,
    provider: String,
    api_key: String,
    label: String,
    metadata: Option<serde_json::Value>,
    suffix: Option<String>,
) -> Result<BrokerResponse, String> {
    require_local_window(&window)?;
    let provider_kind: ProviderKind = serde_json::from_value(serde_json::json!(provider))
        .map_err(|_| "Invalid provider".to_string())?;
    let cmd = BrokerCommand::StoreApiKey {
        provider: provider_kind,
        api_key,
        label,
        metadata: metadata.and_then(|v| serde_json::from_value(v).ok()),
        suffix,
    };
    Ok(handle_broker_command(&state, cmd).await)
}

#[tauri::command]
async fn credential_update_api_key<R: tauri::Runtime>(
    window: tauri::WebviewWindow<R>,
    state: tauri::State<'_, Arc<CredentialBroker>>,
    provider: String,
    api_key: String,
    suffix: Option<String>,
) -> Result<BrokerResponse, String> {
    require_local_window(&window)?;
    let provider_kind: ProviderKind = serde_json::from_value(serde_json::json!(provider))
        .map_err(|_| "Invalid provider".to_string())?;
    let cmd = BrokerCommand::UpdateApiKey {
        provider: provider_kind,
        api_key,
        suffix,
    };
    Ok(handle_broker_command(&state, cmd).await)
}

#[tauri::command]
async fn credential_get_api_key_status<R: tauri::Runtime>(
    window: tauri::WebviewWindow<R>,
    state: tauri::State<'_, Arc<CredentialBroker>>,
    provider: String,
    suffix: Option<String>,
) -> Result<BrokerResponse, String> {
    require_local_window(&window)?;
    let provider_kind: ProviderKind = serde_json::from_value(serde_json::json!(provider))
        .map_err(|_| "Invalid provider".to_string())?;
    let cmd = BrokerCommand::GetApiKeyStatus {
        provider: provider_kind,
        suffix,
    };
    Ok(handle_broker_command(&state, cmd).await)
}

#[tauri::command]
async fn credential_delete_api_key<R: tauri::Runtime>(
    window: tauri::WebviewWindow<R>,
    state: tauri::State<'_, Arc<CredentialBroker>>,
    provider: String,
    suffix: Option<String>,
) -> Result<BrokerResponse, String> {
    require_local_window(&window)?;
    let provider_kind: ProviderKind = serde_json::from_value(serde_json::json!(provider))
        .map_err(|_| "Invalid provider".to_string())?;
    let cmd = BrokerCommand::DeleteApiKey {
        provider: provider_kind,
        suffix,
    };
    Ok(handle_broker_command(&state, cmd).await)
}

#[tauri::command]
async fn credential_list_provider_credentials<R: tauri::Runtime>(
    window: tauri::WebviewWindow<R>,
    state: tauri::State<'_, Arc<CredentialBroker>>,
    provider: String,
) -> Result<BrokerResponse, String> {
    require_local_window(&window)?;
    let provider_kind: ProviderKind = serde_json::from_value(serde_json::json!(provider))
        .map_err(|_| "Invalid provider".to_string())?;
    let cmd = BrokerCommand::ListProviderCredentials {
        provider: provider_kind,
    };
    Ok(handle_broker_command(&state, cmd).await)
}

#[tauri::command]
async fn credential_store_refresh_token<R: tauri::Runtime>(
    window: tauri::WebviewWindow<R>,
    state: tauri::State<'_, Arc<CredentialBroker>>,
    provider: String,
    token: String,
    label: String,
    suffix: Option<String>,
) -> Result<BrokerResponse, String> {
    require_local_window(&window)?;
    let provider_kind: ProviderKind = serde_json::from_value(serde_json::json!(provider))
        .map_err(|_| "Invalid provider".to_string())?;
    let cmd = BrokerCommand::StoreRefreshToken {
        provider: provider_kind,
        token,
        label,
        suffix,
    };
    Ok(handle_broker_command(&state, cmd).await)
}

#[tauri::command]
async fn credential_get_refresh_token_status<R: tauri::Runtime>(
    window: tauri::WebviewWindow<R>,
    state: tauri::State<'_, Arc<CredentialBroker>>,
    provider: String,
    suffix: Option<String>,
) -> Result<BrokerResponse, String> {
    require_local_window(&window)?;
    let provider_kind: ProviderKind = serde_json::from_value(serde_json::json!(provider))
        .map_err(|_| "Invalid provider".to_string())?;
    let cmd = BrokerCommand::GetRefreshTokenStatus {
        provider: provider_kind,
        suffix,
    };
    Ok(handle_broker_command(&state, cmd).await)
}

#[tauri::command]
async fn credential_delete_refresh_token<R: tauri::Runtime>(
    window: tauri::WebviewWindow<R>,
    state: tauri::State<'_, Arc<CredentialBroker>>,
    provider: String,
    suffix: Option<String>,
) -> Result<BrokerResponse, String> {
    require_local_window(&window)?;
    let provider_kind: ProviderKind = serde_json::from_value(serde_json::json!(provider))
        .map_err(|_| "Invalid provider".to_string())?;
    let cmd = BrokerCommand::DeleteRefreshToken {
        provider: provider_kind,
        suffix,
    };
    Ok(handle_broker_command(&state, cmd).await)
}

#[tauri::command]
async fn credential_store_local_endpoint<R: tauri::Runtime>(
    window: tauri::WebviewWindow<R>,
    state: tauri::State<'_, Arc<CredentialBroker>>,
    provider: String,
    endpoint_url: String,
    model_id: String,
    label: String,
    suffix: Option<String>,
) -> Result<BrokerResponse, String> {
    require_local_window(&window)?;
    let provider_kind: ProviderKind = serde_json::from_value(serde_json::json!(provider))
        .map_err(|_| "Invalid provider".to_string())?;
    let cmd = BrokerCommand::StoreLocalEndpoint {
        provider: provider_kind,
        endpoint_url,
        model_id,
        label,
        suffix,
    };
    Ok(handle_broker_command(&state, cmd).await)
}

#[tauri::command]
async fn credential_get_local_endpoint_status<R: tauri::Runtime>(
    window: tauri::WebviewWindow<R>,
    state: tauri::State<'_, Arc<CredentialBroker>>,
    provider: String,
    suffix: Option<String>,
) -> Result<BrokerResponse, String> {
    require_local_window(&window)?;
    let provider_kind: ProviderKind = serde_json::from_value(serde_json::json!(provider))
        .map_err(|_| "Invalid provider".to_string())?;
    let cmd = BrokerCommand::GetLocalEndpointStatus {
        provider: provider_kind,
        suffix,
    };
    Ok(handle_broker_command(&state, cmd).await)
}

#[tauri::command]
async fn credential_get_local_endpoint<R: tauri::Runtime>(
    window: tauri::WebviewWindow<R>,
    state: tauri::State<'_, Arc<CredentialBroker>>,
    provider: String,
    suffix: Option<String>,
) -> Result<BrokerResponse, String> {
    require_local_window(&window)?;
    let provider_kind: ProviderKind = serde_json::from_value(serde_json::json!(provider))
        .map_err(|_| "Invalid provider".to_string())?;
    let cmd = BrokerCommand::GetLocalEndpoint {
        provider: provider_kind,
        suffix,
    };
    Ok(handle_broker_command(&state, cmd).await)
}

#[tauri::command]
async fn credential_delete_local_endpoint<R: tauri::Runtime>(
    window: tauri::WebviewWindow<R>,
    state: tauri::State<'_, Arc<CredentialBroker>>,
    provider: String,
    suffix: Option<String>,
) -> Result<BrokerResponse, String> {
    require_local_window(&window)?;
    let provider_kind: ProviderKind = serde_json::from_value(serde_json::json!(provider))
        .map_err(|_| "Invalid provider".to_string())?;
    let cmd = BrokerCommand::DeleteLocalEndpoint {
        provider: provider_kind,
        suffix,
    };
    Ok(handle_broker_command(&state, cmd).await)
}

#[tauri::command]
async fn resolve_native_paths(channel: String) -> Result<serde_json::Value, String> {
    use std::path::PathBuf;

    let is_preview = channel == "preview";
    let app_name = if is_preview {
        "xyz.gen1e.lattice-os.preview"
    } else {
        "xyz.gen1e.lattice-os"
    };

    let base_dir = if cfg!(target_os = "windows") {
        std::env::var("LOCALAPPDATA")
            .or_else(|_| std::env::var("APPDATA"))
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from("."))
    } else {
        std::env::var("HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from("."))
            .join(".local/share")
    };

    let stable_root = base_dir.join("xyz.gen1e.lattice-os");
    let preview_root = base_dir.join("xyz.gen1e.lattice-os.preview");

    let make_paths = |root: &PathBuf| -> serde_json::Value {
        let root_str = root.to_string_lossy().to_string();
        let profiles_root_str = root.join("profiles").to_string_lossy().to_string();
        serde_json::json!({
            "root": root_str + "/",
            "profilesRoot": profiles_root_str + "/",
            "profileConfigTemplate": profiles_root_str + "/{profileId}/config.json",
            "profileStateTemplate": profiles_root_str + "/{profileId}/state.sqlite",
            "profileLogsTemplate": profiles_root_str + "/{profileId}/logs/",
            "profileCacheTemplate": profiles_root_str + "/{profileId}/cache/",
        })
    };

    Ok(serde_json::json!({
        "channel": channel,
        "stable": make_paths(&stable_root),
        "preview": make_paths(&preview_root),
    }))
}

#[tauri::command]
async fn load_profile_config<R: tauri::Runtime>(
    window: tauri::WebviewWindow<R>,
    profile_id: String,
    channel: String,
) -> Result<Option<serde_json::Value>, String> {
    require_local_window(&window)?;
    // Validate profile ID
    if !profile_id
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
        || profile_id.is_empty()
        || profile_id.len() > 64
    {
        return Err("Invalid profile ID".to_string());
    }
    let is_preview = channel == "preview";
    let app_name = if is_preview {
        "xyz.gen1e.lattice-os.preview"
    } else {
        "xyz.gen1e.lattice-os"
    };

    let base_dir = if cfg!(target_os = "windows") {
        std::env::var("LOCALAPPDATA")
            .or_else(|_| std::env::var("APPDATA"))
            .map(std::path::PathBuf::from)
            .map_err(|_| "Could not determine app data directory".to_string())?
    } else {
        std::env::var("HOME")
            .map(std::path::PathBuf::from)
            .map_err(|_| "Could not determine home directory".to_string())?
            .join(".local/share")
    };

    let root = base_dir.join(app_name);
    let config_path = root.join("profiles").join(&profile_id).join("config.json");

    // Ensure path is within allowed root (prevent traversal)
    let canonical_root = root.canonicalize().map_err(|e| e.to_string())?;
    // If file doesn't exist, check parent directory
    let canonical_path = config_path
        .canonicalize()
        .or_else(|_| config_path.parent().unwrap().canonicalize())
        .map_err(|e| e.to_string())?;
    if !canonical_path.starts_with(&canonical_root) {
        return Err("Path traversal attempt blocked".to_string());
    }

    if !config_path.exists() {
        return Ok(None); // First run - caller will create defaults
    }

    let content = std::fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
    let value: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(Some(value))
}

#[tauri::command]
async fn save_profile_config<R: tauri::Runtime>(
    window: tauri::WebviewWindow<R>,
    profile_id: String,
    channel: String,
    settings: serde_json::Value,
) -> Result<(), String> {
    require_local_window(&window)?;
    // Validate profile ID
    if !profile_id
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
        || profile_id.is_empty()
        || profile_id.len() > 64
    {
        return Err("Invalid profile ID".to_string());
    }
    let is_preview = channel == "preview";
    let app_name = if is_preview {
        "xyz.gen1e.lattice-os.preview"
    } else {
        "xyz.gen1e.lattice-os"
    };

    let base_dir = if cfg!(target_os = "windows") {
        std::env::var("LOCALAPPDATA")
            .or_else(|_| std::env::var("APPDATA"))
            .map(std::path::PathBuf::from)
            .map_err(|_| "Could not determine app data directory".to_string())?
    } else {
        std::env::var("HOME")
            .map(std::path::PathBuf::from)
            .map_err(|_| "Could not determine home directory".to_string())?
            .join(".local/share")
    };

    let root = base_dir.join(app_name);
    let config_path = root.join("profiles").join(&profile_id).join("config.json");

    // Ensure path is within allowed root (prevent traversal)
    // If file doesn't exist, check parent directory
    let canonical_root = root.canonicalize().map_err(|e| e.to_string())?;
    let canonical_path = config_path
        .canonicalize()
        .or_else(|_| config_path.parent().unwrap().canonicalize())
        .map_err(|e| e.to_string())?;
    if !canonical_path.starts_with(&canonical_root) {
        return Err("Path traversal attempt blocked".to_string());
    }

    // Atomic write: write to temp file then rename
    let temp_path = config_path.with_extension("json.tmp");
    if let Some(parent) = config_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let content = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    std::fs::write(&temp_path, content).map_err(|e| e.to_string())?;
    std::fs::rename(&temp_path, &config_path).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn list_profiles<R: tauri::Runtime>(
    window: tauri::WebviewWindow<R>,
    channel: String,
) -> Result<Vec<String>, String> {
    require_local_window(&window)?;
    let is_preview = channel == "preview";
    let app_name = if is_preview {
        "xyz.gen1e.lattice-os.preview"
    } else {
        "xyz.gen1e.lattice-os"
    };

    let base_dir = if cfg!(target_os = "windows") {
        std::env::var("LOCALAPPDATA")
            .or_else(|_| std::env::var("APPDATA"))
            .map(std::path::PathBuf::from)
            .map_err(|_| "Could not determine app data directory".to_string())?
    } else {
        std::env::var("HOME")
            .map(std::path::PathBuf::from)
            .map_err(|_| "Could not determine home directory".to_string())?
            .join(".local/share")
    };

    let root = base_dir.join(app_name);
    let profiles_root = root.join("profiles");

    // Ensure path is within allowed root
    let canonical_root = root.canonicalize().map_err(|e| e.to_string())?;
    let canonical_profiles = profiles_root.canonicalize().map_err(|e| e.to_string())?;
    if !canonical_profiles.starts_with(&canonical_root) {
        return Err("Path traversal attempt blocked".to_string());
    }

    if !profiles_root.exists() {
        return Ok(vec![]);
    }

    let mut profiles = Vec::new();
    for entry in std::fs::read_dir(&profiles_root).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.is_dir() {
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                // Only return valid profile IDs
                if name
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
                    && !name.is_empty()
                    && name.len() <= 64
                {
                    profiles.push(name.to_string());
                }
            }
        }
    }
    Ok(profiles)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .manage(review::ReviewWindows::<tauri::Wry>::default())
        .register_uri_scheme_protocol("lattice-review", |_, request| review::resource(request))
        .on_window_event(review::window_event)
        .plugin(workspace::boundary())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(
            tauri_plugin_stronghold::Builder::new(|password| {
                use sha2::{Digest, Sha256};
                let mut hasher = Sha256::new();
                hasher.update(password);
                hasher.finalize().to_vec()
            })
            .build(),
        )
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            use tauri::Emitter;
            for arg in args {
                if arg.starts_with("latticeos://") {
                    let _ = app.emit("oauth_callback", arg);
                }
            }
        }))
        .setup(|app| {
            let host = Arc::new(NativeHost::default());
            app.manage(host.clone());

            // Initialize credential broker
            let broker =
                tauri::async_runtime::block_on(async { init_credential_broker().await })?;
            app.manage(broker);

            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let _ = host.start(TauriLauncher(handle)).await;
            });
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ping_daemon,
            restart_daemon,
            flush_telemetry,
            credential_store_api_key,
            credential_update_api_key,
            credential_get_api_key_status,
            credential_delete_api_key,
            credential_list_provider_credentials,
            credential_store_refresh_token,
            credential_get_refresh_token_status,
            credential_delete_refresh_token,
            credential_store_local_endpoint,
            credential_get_local_endpoint_status,
            credential_get_local_endpoint,
            credential_delete_local_endpoint,
            resolve_native_paths,
            load_profile_config,
            save_profile_config,
            list_profiles,
            workspace::native_select_folder,
            workspace::native_workspace_grants,
            workspace::native_revoke_grant,
            workspace::native_request_write_access,
            workspace::native_list,
            workspace::native_stat,
            workspace::native_read_text,
            workspace::native_daemon_status,
            review::native_propose_operation,
            review::native_proposal_status,
            review::native_cancel_proposal,
            review::native_open_review,
            review::native_review_document,
            review::native_review_ready,
            review::native_review_decide,
            review::native_review_cancel,
            review::native_dispatch_operation,
            review::native_operation_status,
            review::native_cancel_operation,
            review::native_command_output,
        ])
        .build(tauri::generate_context!())
        .expect("error while building Tauri application");
    let exit_started = Arc::new(AtomicBool::new(false));
    let exit_ready = Arc::new(AtomicBool::new(false));
    app.run(move |handle, event| match event {
        tauri::RunEvent::ExitRequested { api, code, .. } if !exit_ready.load(Ordering::Acquire) => {
            api.prevent_exit();
            if !exit_started.swap(true, Ordering::AcqRel) {
                let app = handle.clone();
                let host = handle.state::<Arc<NativeHost>>().inner().clone();
                let ready = exit_ready.clone();
                tauri::async_runtime::spawn(async move {
                    let clean = host.shutdown().await.is_ok();
                    if !clean {
                        log::error!("LOCAL_CLEANUP_UNCONFIRMED");
                    }
                    ready.store(true, Ordering::Release);
                    app.exit(if clean { code.unwrap_or(0) } else { 1 });
                });
            }
        }
        tauri::RunEvent::Exit => handle.state::<Arc<NativeHost>>().emergency_stop(),
        _ => {}
    });
}
