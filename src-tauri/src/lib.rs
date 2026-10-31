mod native_host;
mod review;
mod workspace;

#[cfg(test)]
mod ipc_tests;
#[cfg(test)]
mod review_test_support;

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
            workspace::native_select_folder,
            workspace::native_workspace_grants,
            workspace::native_revoke_grant,
            workspace::native_list,
            workspace::native_stat,
            workspace::native_read_text,
            review::native_propose_operation,
            review::native_proposal_status,
            review::native_cancel_proposal,
            review::native_open_review,
            review::native_review_document,
            review::native_review_ready,
            review::native_review_decide,
            review::native_review_cancel
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
