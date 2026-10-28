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
            flush_telemetry,
            workspace::native_select_folder,
            workspace::native_workspace_grants,
            workspace::native_revoke_grant,
            workspace::native_list,
            workspace::native_stat,
            workspace::native_read_text
        ])
        .build(tauri::generate_context!())
        .unwrap()
}

fn call(
    window: &tauri::WebviewWindow<MockRuntime>,
    command: &str,
    url: &str,
) -> Result<tauri::ipc::InvokeResponseBody, serde_json::Value> {
    call_input(window, command, url, json!({}))
}

fn call_input(
    window: &tauri::WebviewWindow<MockRuntime>,
    command: &str,
    url: &str,
    input: serde_json::Value,
) -> Result<tauri::ipc::InvokeResponseBody, serde_json::Value> {
    get_ipc_response(
        window,
        InvokeRequest {
            cmd: command.into(),
            callback: CallbackFn(0),
            error: CallbackFn(1),
            url: url.parse().unwrap(),
            body: InvokeBody::Json(json!({"input":input})),
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
        "plugin:dialog|open",
        "plugin:fs|read_text_file",
        "native_update_grants",
        "bind_native_session",
        "sync_root_grants",
        "invoke_daemon",
    ] {
        let rejected = call(&main, command, &url).err().unwrap().to_string();
        assert!(rejected.contains("not allowed"), "{command}: {rejected}");
    }
}

#[test]
fn only_main_local_can_request_typed_workspace_reads() {
    let app = app();
    let main = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    let other = tauri::WebviewWindowBuilder::new(&app, "other", Default::default())
        .build()
        .unwrap();
    let url = main.url().unwrap().to_string();
    for command in [
        "native_select_folder",
        "native_workspace_grants",
        "native_revoke_grant",
        "native_list",
        "native_stat",
        "native_read_text",
    ] {
        let input = match command {
            "native_select_folder" | "native_workspace_grants" => json!({}),
            "native_revoke_grant" => json!({"grant_id":"unpermitted"}),
            _ => json!({"grant_id":"unpermitted","relative_path":"."}),
        };
        let local = call_input(&main, command, &url, input.clone())
            .err()
            .unwrap();
        assert_eq!(local["code"], "LOCAL_SERVICE_STOPPED", "{command}: {local}");
        for (window, origin) in [
            (&other, url.as_str()),
            (&main, "https://untrusted.invalid/"),
        ] {
            let denied = call_input(window, command, origin, input.clone())
                .err()
                .unwrap()
                .to_string();
            assert!(denied.contains("not allowed"), "{command}: {denied}");
        }
    }
}

#[test]
fn workspace_ipc_cannot_accept_path_grant_or_identity_setters() {
    let app = app();
    let main = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    let url = main.url().unwrap().to_string();
    for (command, input) in [
        (
            "native_select_folder",
            json!({"path":"/unselected","approved":true}),
        ),
        (
            "native_read_text",
            json!({"grant_id":"unpermitted","relative_path":".","user_id":"employee"}),
        ),
        (
            "native_revoke_grant",
            json!({"grant_id":"unpermitted","grants":[]}),
        ),
    ] {
        let denied = call_input(&main, command, &url, input)
            .err()
            .unwrap()
            .to_string();
        assert!(denied.contains("unknown field"), "{command}: {denied}");
    }
}
