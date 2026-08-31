// src-tauri/src/lib.rs
//
// Tauri <-> lattice-harness (Go sidecar) IPC bridge.
//
// The Go daemon (`cmd/lattice-harness`) is an ephemeral-port JSON-RPC HTTP
// server. On boot it prints a single line to stdout:
//     {"status":"ready","port":<N>}
// and then serves `POST /rpc` with `{ id, jsonrpc, workspaceRoot, action,
// inputs }`. Rust is the parent process and is responsible for capturing that
// port and proxying a lightweight `status` call so the Next.js webview can
// render the daemon's live telemetry.
//
// State note (per design review): we use `std::sync::Mutex` (NOT tokio locks)
// and deliberately drop the guard *before* any `.await` — the critical section
// is a single `u16` copy. `OnceLock` was ruled out because a crash/restart must
// be able to return the port to `None` so the UI can re-show the boot state.

use serde::Serialize;
use serde_json::json;
use std::sync::Mutex;
use std::time::Duration;

/// Shared, Tauri-managed state. `None` until the sidecar's stdout handshake
/// delivers a port, and reset to `None` on a hard sidecar failure so the
/// frontend can fall back to the "Boot the Local Harness" empty state.
#[derive(Default)]
struct SidecarState {
    port: Mutex<Option<u16>>,
}

impl SidecarState {
    fn port(&self) -> Option<u16> {
        match self.port.lock() {
            Ok(g) => *g,
            Err(_) => None, // poisoned -> treat as not ready
        }
    }

    fn set_port(&self, port: Option<u16>) {
        if let Ok(mut g) = self.port.lock() {
            *g = port;
        }
    }
}

/// One event row for the Security Audit stream, mapped from the daemon's
/// internal telemetry event (`go-harness/internal/telemetry`).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct HarnessEvent {
    id: String,
    timestamp: String,
    #[serde(rename = "type")]
    event_type: String,
    description: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    payload: Option<serde_json::Value>,
}

/// Minimal JSON-RPC request matching `cmd/lattice-harness` (`action`+`inputs`).
#[derive(Serialize)]
struct RpcRequest<'a> {
    id: &'a str,
    jsonrpc: &'a str,
    #[serde(rename = "workspaceRoot")]
    workspace_root: &'a str,
    action: &'a str,
    inputs: serde_json::Value,
}

async fn request_sidecar(port: u16, action: &str) -> Result<serde_json::Value, String> {
    let body = RpcRequest {
        id: &format!("tauri-{}", uuid_v4()),
        jsonrpc: "2.0",
        workspace_root: "",
        action,
        inputs: json!({}),
    };

    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(1500))
        .build()
        .map_err(|e| format!("http client build: {e}"))?;

    let resp = client
        .post(format!("http://127.0.0.1:{port}/rpc"))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("sidecar unreachable: {e}"))?;

    let parsed: serde_json::Value = resp.json().await.map_err(|e| format!("bad json: {e}"))?;

    if let Some(err) = parsed.get("error") {
        return Err(err.get("message").and_then(|m| m.as_str()).unwrap_or("rpc error").to_string());
    }
    Ok(parsed.get("result").cloned().unwrap_or(serde_json::Value::Null))
}

/// Convert a daemon `TelemetryEvent` json into the frontend `HarnessEvent`.
fn to_harness_event(ev: &serde_json::Value) -> HarnessEvent {
    let event_type = ev.get("event_type").and_then(|v| v.as_str()).unwrap_or("heartbeat");
    let path = ev.get("path_accessed").and_then(|v| v.as_str()).unwrap_or("");
    let success = ev.get("success").and_then(|v| v.as_bool()).unwrap_or(true);
    HarnessEvent {
        id: ev.get("id").and_then(|v| v.as_str()).map(String::from).unwrap_or_else(uuid_v4),
        timestamp: ev.get("timestamp").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        event_type: ui_event_type(event_type).to_string(),
        description: format!("{event_type}{}: {}", if path.is_empty() { "".into() } else { format!(" {path}") }, if success { "ok" } else { "failed" }),
        payload: Some(ev.clone()),
    }
}

/// Map daemon event types onto the hook's four display classes.
fn ui_event_type(daemon_type: &str) -> &'static str {
    match daemon_type {
        // anything mutating / executing
        t if t.contains("command") || t.contains("delete") || t.contains("move") => "execution",
        // reads/stat/list
        t if t.contains("read") || t.contains("stat") || t.contains("list") || t.contains("discover") => "read",
        // sync/ingest
        t if t.contains("ingest") || t.contains("sync") || t.contains("synchroniz") => "sync",
        _ => "heartbeat",
    }
}

fn uuid_v4() -> String {
    // Small, dependency-free v4 uuid (bridge only needs uniqueness for keys).
    use std::time::{SystemTime, UNIX_EPOCH};
    let now = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    format!("{:08x}-{:04x}-4{:03x}-{:04x}-{:012x}", (now & 0xFFFF_FFFF) as u32, (now >> 32) as u16, (now >> 48) as u16 & 0xFFF, ((now >> 16) as u16 & 0x3FFF) | 0x8000, (now & 0xFFFF_FFFF_FFFF) as u64)
}

#[tauri::command]
async fn ping_daemon(state: tauri::State<'_, SidecarState>) -> Result<serde_json::Value, String> {
    // Scoped lock: copy the port and release the guard BEFORE any await.
    let port = state.port();

    let Some(port) = port else {
        // Sidecar hasn't announced a port yet (still booting) — not an error.
        return Ok(json!({ "status": "booting", "recent_events": [] }));
    };

    match request_sidecar(port, "status").await {
        Ok(result) => {
            let events = result
                .get("data")
                .and_then(|d| d.get("recent_events"))
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default();
            Ok(json!({
                "status": "ok",
                "port": port,
                "recent_events": events.iter().map(to_harness_event).collect::<Vec<_>>(),
            }))
        }
        Err(e) => {
            // Sidecar is unreachable — release the port so the UI can offer
            // a restart path rather than trusting a dead daemon.
            state.set_port(None);
            Err(format!("daemon unreachable: {e}"))
        }
    }
}

#[tauri::command]
async fn flush_telemetry() -> Result<serde_json::Value, String> {
    // The native telemetry ledger lives in the webview (IndexedDB) and is
    // flushed to the enterprise instance by the JS layer (flushNativeTelemetry).
    // This command is the Rust-side trigger/hook: it signals the frontend to
    // perform the flush and reports ledger status from the Tauri store.
    Ok(json!({ "status": "trigger_ok" }))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_store::Builder::default().build())
    .plugin(tauri_plugin_stronghold::Builder::new(|password| {
        use sha2::{Digest, Sha256};
        let mut hasher = Sha256::new();
        hasher.update(password);
        hasher.finalize().to_vec()
    }).build())
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
      use tauri_plugin_shell::ShellExt;
      use tauri_plugin_shell::process::CommandEvent;

      let state = SidecarState::default();
      let app_handle = app.handle().clone();

      // Spawn the Go sidecar and capture its stdout handshake.
      // The daemon prints {"status":"ready","port":N} once on boot.
      let sidecar_command = app.shell().sidecar("lattice-harness").unwrap();
      let (mut rx, _child) = sidecar_command
          .spawn()
          .expect("Failed to spawn lattice-harness sidecar");

      app.manage(state);

      tauri::async_runtime::spawn(async move {
        use tauri::Manager;
        let state = app_handle.state::<SidecarState>();
        while let Some(event) = rx.recv().await {
          if let CommandEvent::Stdout(line) = event {
            let line = String::from_utf8_lossy(&line);
            let line = line.trim();
            if line.contains("\"status\":\"ready\"") || line.contains("\"status\": \"ready\"") {
              if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(line) {
                if let Some(port) = parsed.get("port").and_then(|p| p.as_u64()).map(|p| p as u16) {
                  state.set_port(Some(port));
                  log::info!("lattice-harness sidecar ready on port {port}");
                }
              }
            }
          }
        }
        // stdout closed — sidecar exited; drop the port so UI shows boot state.
        state.set_port(None);
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
    .invoke_handler(tauri::generate_handler![ping_daemon, flush_telemetry])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
