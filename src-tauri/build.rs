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
            "native_propose_operation",
            "native_proposal_status",
            "native_cancel_proposal",
            "native_open_review",
            "native_review_document",
            "native_review_ready",
            "native_review_decide",
            "native_review_cancel",
        ]),
    ))
    .expect("native command permissions must compile");
}
