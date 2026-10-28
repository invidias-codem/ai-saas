mod native_host;

use lattice_native_host::{permits_window, TelemetryEvent};
use native_host::{NativeHost, Phase};
use serde::Serialize;
use serde_json::json;
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

fn require_local_window(window: &tauri::WebviewWindow) -> Result<(), String> {
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
async fn ping_daemon(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, Arc<NativeHost>>,
) -> Result<serde_json::Value, String> {
    require_local_window(&window)?;
    match state.status().await {
        Ok(Some(status)) => Ok(json!({
            "status": "ok",
            "recent_events": status.events.iter().map(to_harness_event).collect::<Vec<_>>()
        })),
        Ok(None) => Ok(json!({"status":"booting","recent_events":[]})),
        Err(error) => Ok(json!({
            "status": if state.phase() == Phase::Stopped { "stopped" } else { "error" },
            "recent_events": [],
            "error": { "code": error.code(), "message": error.message() }
        })),
    }
}

#[tauri::command]
async fn flush_telemetry(window: tauri::WebviewWindow) -> Result<serde_json::Value, String> {
    require_local_window(&window)?;
    // Existing frontend trigger only; no generic native RPC or cloud credential.
    Ok(json!({"status":"trigger_ok"}))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
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
            tauri::async_runtime::spawn(native_host::start(handle, host));
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![ping_daemon, flush_telemetry])
        .build(tauri::generate_context!())
        .expect("error while building Tauri application");
    app.run(|handle, event| {
        if let tauri::RunEvent::Exit = event {
            handle.state::<Arc<NativeHost>>().stop();
        }
    });
}
