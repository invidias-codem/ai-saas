fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "ping_daemon",
            "restart_daemon",
            "flush_telemetry",
            "native_select_folder",
            "native_workspace_grants",
            "native_revoke_grant",
            "native_list",
            "native_stat",
            "native_read_text",
        ]),
    ))
    .expect("native command permissions must compile");
}
