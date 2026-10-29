fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "ping_daemon",
            "restart_daemon",
            "flush_telemetry",
        ]),
    ))
    .expect("native command permissions must compile");
}
