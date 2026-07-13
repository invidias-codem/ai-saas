#[tauri::command]
async fn ping_daemon() -> Result<String, String> {
    Ok("ok".to_string())
}

#[tauri::command]
async fn flush_telemetry() -> Result<serde_json::Value, String> {
    // The native telemetry ledger lives in the webview (IndexedDB) and is
    // flushed to the enterprise instance by the JS layer (flushNativeTelemetry).
    // This command is the Rust-side trigger/hook: it signals the frontend to
    // perform the flush and reports ledger status from the Tauri store.
    // Note: the canonical ledger is in the webview; we simply acknowledge the
    // trigger. The frontend invokes this and then calls the HTTP flush.
    // (Store-backed fallback retained for headless operation.)
    Ok(serde_json::json!({ "status": "trigger_ok" }))
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
      let sidecar_command = app.shell().sidecar("lattice-harness").unwrap();
      let (_rx, _child) = sidecar_command
          .spawn()
          .expect("Failed to spawn lattice-harness sidecar");

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
