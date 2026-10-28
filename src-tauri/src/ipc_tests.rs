//! Exercise Tauri's real IPC permission resolver with the production manifest.
//! MockRuntime avoids launching a GUI; it does not qualify an installed webview.
use super::*;
use tauri::{
    ipc::{CallbackFn, InvokeBody},
    test::{get_ipc_response, mock_builder, MockRuntime, INVOKE_KEY},
    webview::InvokeRequest,
};

fn app() -> tauri::App<MockRuntime> {
    mock_builder()
        .manage(Arc::new(NativeHost::default()))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_stronghold::Builder::new(|_| vec![0; 32]).build())
        .invoke_handler(tauri::generate_handler![
            ping_daemon,
            restart_daemon,
            flush_telemetry
        ])
        .build(tauri::generate_context!())
        .unwrap()
}

fn call(
    window: &tauri::WebviewWindow<MockRuntime>,
    command: &str,
    url: &str,
) -> Result<tauri::ipc::InvokeResponseBody, serde_json::Value> {
    get_ipc_response(
        window,
        InvokeRequest {
            cmd: command.into(),
            callback: CallbackFn(0),
            error: CallbackFn(1),
            url: url.parse().unwrap(),
            body: InvokeBody::Json(json!({})),
            headers: Default::default(),
            invoke_key: INVOKE_KEY.into(),
        },
    )
}

#[test]
fn only_the_main_local_webview_can_use_the_declared_controls() {
    let app = app();
    let main = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    let other = tauri::WebviewWindowBuilder::new(&app, "other", Default::default())
        .build()
        .unwrap();
    let url = main.url().unwrap().to_string();
    assert!(call(&main, "flush_telemetry", &url).is_ok());
    let rejected = call(&other, "flush_telemetry", &url)
        .err()
        .unwrap()
        .to_string();
    assert!(rejected.contains("not allowed"), "{rejected}");
    let rejected = call(&main, "flush_telemetry", "https://untrusted.invalid/")
        .err()
        .unwrap()
        .to_string();
    assert!(rejected.contains("not allowed"), "{rejected}");
}

#[test]
fn main_has_no_shell_secret_store_or_generic_rpc_permission() {
    let app = app();
    let main = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    let url = main.url().unwrap().to_string();
    for command in [
        "plugin:shell|execute",
        "plugin:stronghold|initialize",
        "plugin:event|emit",
        "sync_root_grants",
        "invoke_daemon",
    ] {
        let rejected = call(&main, command, &url).err().unwrap().to_string();
        assert!(rejected.contains("not allowed"), "{command}: {rejected}");
    }
}
