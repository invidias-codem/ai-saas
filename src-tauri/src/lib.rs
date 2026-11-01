mod credential_broker;
mod native_host;
mod profiles;
mod review;
mod workspace;

#[cfg(test)]
mod ipc_tests;
#[cfg(test)]
mod review_test_support;

use credential_broker::{handle_broker_command, init_credential_broker, BrokerResponse};
use lattice_credential_broker::{BrokerCommand, CredentialBroker, ProviderKind};
use lattice_native_host::lifecycle::{NativeHost, Phase};
use lattice_native_host::{permits_window, TelemetryEvent};
use lattice_native_host::supervisor::{serve, Supervisor};
use native_host::TauriLauncher;
use serde::Serialize;
use serde_json::json;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::Manager;
use tokio::net::TcpListener;

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

// Supervisor commands — the desktop reaches the same Supervisor state the CLI
// reaches over TCP, so both clients observe one consistent session journal.

#[tauri::command]
async fn supervisor_status(
    state: tauri::State<'_, Arc<Supervisor>>,
) -> Result<serde_json::Value, String> {
    Ok(state.status().await)
}

#[tauri::command]
async fn supervisor_ensure_host<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, Arc<Supervisor>>,
) -> Result<(), String> {
    state
        .ensure_host(TauriLauncher(app))
        .await
        .map_err(|e| e.message().to_string())
}

#[tauri::command]
async fn supervisor_session_create(
    state: tauri::State<'_, Arc<Supervisor>>,
) -> Result<serde_json::Value, String> {
    state
        .session_create("desktop")
        .await
        .map(|s| json!({ "session": s }))
        .map_err(|e| e.message().to_string())
}

#[tauri::command]
async fn supervisor_session_list(
    state: tauri::State<'_, Arc<Supervisor>>,
) -> Result<serde_json::Value, String> {
    Ok(json!({ "sessions": state.list_sessions().await }))
}

#[tauri::command]
async fn supervisor_event_append(
    state: tauri::State<'_, Arc<Supervisor>>,
    session_id: String,
    kind: String,
    payload: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    state
        .append_event("desktop", &session_id, kind, payload.unwrap_or(json!({})))
        .await
        .map(|e| json!({ "event": e }))
        .map_err(|e| e.message().to_string())
}

#[tauri::command]
async fn supervisor_cancel(
    state: tauri::State<'_, Arc<Supervisor>>,
    session_id: String,
) -> Result<serde_json::Value, String> {
    state
        .cancel_session("desktop", &session_id)
        .await
        .map(|s| json!({ "session_id": s }))
        .map_err(|e| e.message().to_string())
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
async fn resolve_native_paths<R: tauri::Runtime>(
    window: tauri::WebviewWindow<R>,
    channel: String,
) -> Result<serde_json::Value, String> {
    require_local_window(&window)?;
    Ok(profiles::paths(&profiles::native_root(&channel)?))
}

#[tauri::command]
async fn load_profile_config<R: tauri::Runtime>(
    window: tauri::WebviewWindow<R>,
    profile_id: String,
    channel: String,
) -> Result<Option<serde_json::Value>, String> {
    require_local_window(&window)?;
    profiles::load(&profiles::native_root(&channel)?, &profile_id)
}

#[tauri::command]
async fn save_profile_config<R: tauri::Runtime>(
    window: tauri::WebviewWindow<R>,
    profile_id: String,
    channel: String,
    settings: serde_json::Value,
) -> Result<(), String> {
    require_local_window(&window)?;
    profiles::save(&profiles::native_root(&channel)?, &profile_id, &settings)
}

#[tauri::command]
async fn list_profiles<R: tauri::Runtime>(
    window: tauri::WebviewWindow<R>,
    channel: String,
) -> Result<Vec<String>, String> {
    require_local_window(&window)?;
    profiles::list(&profiles::native_root(&channel)?)
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
            let broker = tauri::async_runtime::block_on(async { init_credential_broker().await })?;
            app.manage(broker);

            // Supervisor: owns the profile's durable session journal and the
            // NativeHost lifecycle, and serves the TCP JSON-RPC transport shared
            // with the CLI. One writer per profile.
            let profile_root = profiles::native_root("stable")?;
            let profile_dir = profile_root.join("profiles/default");
            let supervisor = Arc::new(Supervisor::new("default".to_string(), &profile_dir)?);
            app.manage(supervisor.clone());
            let profile_dir_owned = profile_dir.clone();
            let sup = supervisor.clone();
            tauri::async_runtime::spawn(async move {
                let Ok(listener) = TcpListener::bind("127.0.0.1:0").await else { return };
                let port = listener.local_addr().unwrap().port();
                let _ = std::fs::write(profile_dir_owned.join(".supervisor.addr"), format!("127.0.0.1:{}", port));
                let _ = serve(listener, sup).await;
            });

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
            supervisor_status,
            supervisor_ensure_host,
            supervisor_session_create,
            supervisor_session_list,
            supervisor_event_append,
            supervisor_cancel,
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
