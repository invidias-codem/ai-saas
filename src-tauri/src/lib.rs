#[tauri::command]
async fn ping_daemon() -> Result<String, String> {
    Ok("ok".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
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
    .invoke_handler(tauri::generate_handler![ping_daemon])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
