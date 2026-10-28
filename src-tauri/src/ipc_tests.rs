//! Exercise Tauri's real IPC permission resolver with the production manifest.
//! MockRuntime avoids launching a GUI; it does not qualify an installed webview.
use super::*;
use tauri::{
    ipc::{CallbackFn, InvokeBody},
    test::{get_ipc_response, mock_builder, MockRuntime, INVOKE_KEY},
    webview::InvokeRequest,
};

fn app() -> tauri::App<MockRuntime> {
    app_with_host(Arc::new(NativeHost::default()))
}

fn app_with_host(host: Arc<NativeHost>) -> tauri::App<MockRuntime> {
    mock_builder()
        .manage(host)
        .manage(review::ReviewWindows::<MockRuntime>::default())
        .register_uri_scheme_protocol("lattice-review", |_, request| review::resource(request))
        .on_window_event(review::window_event)
        .plugin(workspace::boundary())
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
        .unwrap()
}

#[test]
fn review_origin_and_embedded_resources_are_closed() {
    for url in [
        "lattice-review://localhost/index.html",
        "http://lattice-review.localhost/index.html",
    ] {
        assert!(review::review_url(url));
    }
    for url in [
        "https://untrusted.invalid/index.html",
        "lattice-review://localhost/index.html?proposal=forged",
        "lattice-review://localhost/index.html#forged",
        "lattice-review://user@localhost/index.html",
        "http://lattice-review.localhost:8080/index.html",
        "lattice-review://localhost/review.js",
    ] {
        assert!(!review::review_url(url), "{url}");
    }
    for (method, uri, expected_status) in [
        ("GET", "/index.html", 200),
        ("GET", "/review.js", 200),
        ("GET", "/review.css", 200),
        ("GET", "/index.html?forged=true", 404),
        ("GET", "/../../secret", 404),
        ("GET", "/policy.json", 404),
        ("POST", "/index.html", 404),
    ] {
        let response = review::resource(
            tauri::http::Request::builder()
                .method(method)
                .uri(uri)
                .body(Vec::new())
                .unwrap(),
        );
        assert_eq!(
            response.status().as_u16(),
            expected_status,
            "{method} {uri}"
        );
        assert_eq!(response.headers()["Content-Security-Policy"], review::csp());
        assert_eq!(response.headers()["Cache-Control"], "no-store");
        assert_eq!(response.headers()["X-Content-Type-Options"], "nosniff");
    }
}

#[test]
fn main_and_forged_review_windows_cannot_submit_decisions() {
    let app = app();
    let main = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    let fake = tauri::WebviewWindowBuilder::new(
        &app,
        "native-review-forged",
        tauri::WebviewUrl::CustomProtocol("lattice-review://localhost/index.html".parse().unwrap()),
    )
    .build()
    .unwrap();
    for command in [
        "native_review_document",
        "native_review_ready",
        "native_review_decide",
        "native_review_cancel",
    ] {
        let input = match command {
            "native_review_ready" => json!({"proposal_id":"forged","digest":"forged"}),
            "native_review_decide" => {
                json!({"proposal_id":"forged","digest":"forged","decision":"accept"})
            }
            _ => json!({}),
        };
        let denied = call_input(&main, command, main.url().unwrap().as_str(), input.clone())
            .err()
            .unwrap()
            .to_string();
        assert!(denied.contains("not allowed"), "{command}: {denied}");
        let denied = call_input(&fake, command, fake.url().unwrap().as_str(), input)
            .err()
            .unwrap();
        assert_eq!(denied["code"], "LOCAL_REVIEW_DENIED", "{command}: {denied}");
    }
    for command in [
        "native_select_folder",
        "native_open_review",
        "native_propose_operation",
        "plugin:shell|execute",
        "plugin:fs|read_text_file",
        "plugin:opener|open_url",
        "plugin:window|create",
        "plugin:event|emit",
        "consume_approval",
    ] {
        let denied = call(&fake, command, fake.url().unwrap().as_str())
            .err()
            .unwrap()
            .to_string();
        assert!(denied.contains("not allowed"), "{command}: {denied}");
    }
}

#[test]
fn a_native_created_review_uses_real_scope_and_never_changes_files() {
    let fixture = super::review_test_support::Fixture::start();
    let app = app_with_host(fixture.host.clone());
    let main = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    let url = main.url().unwrap().to_string();
    let input = json!({"kind":"create_file","grant_id":fixture.grant_id,"relative_path":"proposed.txt","content":"<script>literal</script>\n资料"});
    let proposed = call_input(&main, "native_propose_operation", &url, input)
        .unwrap()
        .deserialize::<serde_json::Value>()
        .unwrap();
    call_input(
        &main,
        "native_open_review",
        &url,
        json!({"proposal_id":proposed["proposal_id"]}),
    )
    .unwrap();
    let window = app
        .webview_windows()
        .into_iter()
        .find(|(label, _)| label.starts_with("native-review-"))
        .unwrap()
        .1;
    let origin = window.url().unwrap().to_string();
    let document = call(&window, "native_review_document", &origin)
        .unwrap()
        .deserialize::<serde_json::Value>()
        .unwrap();
    assert_eq!(document["digest"], proposed["digest"]);
    assert_eq!(document["read_only"], true);
    assert_eq!(document["execution_available"], false);
    let wrong=call_input(&window,"native_review_decide","https://untrusted.invalid/",json!({"proposal_id":document["proposal_id"],"digest":document["digest"],"decision":"accept"})).err().unwrap().to_string();
    assert!(wrong.contains("not allowed"));
    call_input(
        &window,
        "native_review_ready",
        &origin,
        json!({"proposal_id":document["proposal_id"],"digest":document["digest"]}),
    )
    .unwrap();
    call_input(&window,"native_review_decide",&origin,json!({"proposal_id":document["proposal_id"],"digest":document["digest"],"decision":"accept"})).unwrap();
    let status = tauri::async_runtime::block_on(
        fixture
            .host
            .proposal_status(document["proposal_id"].as_str().unwrap()),
    )
    .unwrap();
    assert_eq!(
        status.status,
        lattice_native_host::review::ProposalState::Accepted
    );
    assert!(
        !fixture.project.join("proposed.txt").exists(),
        "review executed an unexposed file operation"
    );
    assert!(call_input(&window,"native_review_decide",&origin,json!({"proposal_id":document["proposal_id"],"digest":document["digest"],"decision":"accept"})).is_err());
}

#[test]
fn review_navigation_and_a_recreated_app_cannot_reuse_native_authority() {
    let fixture = super::review_test_support::Fixture::start();
    let app = app_with_host(fixture.host.clone());
    let proposed = tauri::async_runtime::block_on(fixture.host.propose_operation(
        lattice_native_host::review::ProposalInput::CreateDirectory {
            grant_id: fixture.grant_id.clone(),
            relative_path: "new-dir".into(),
        },
    ))
    .unwrap();
    let main = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    call_input(
        &main,
        "native_open_review",
        main.url().unwrap().as_str(),
        json!({"proposal_id":proposed.proposal_id}),
    )
    .unwrap();
    let window = app
        .webview_windows()
        .into_iter()
        .find(|(label, _)| label.starts_with("native-review-"))
        .unwrap()
        .1;
    let label = window.label().to_owned();
    assert!(!review::allow_navigation(
        app.handle(),
        &label,
        &"https://untrusted.invalid/".parse().unwrap()
    ));
    assert!(call(
        &window,
        "native_review_document",
        window.url().unwrap().as_str()
    )
    .is_err());
    let status =
        tauri::async_runtime::block_on(fixture.host.proposal_status(&proposed.proposal_id))
            .unwrap();
    assert_eq!(
        status.status,
        lattice_native_host::review::ProposalState::Denied
    );
    // MockRuntime does not emit Destroyed or remove Tauri's manager entry.
    // Recreate the app/window registration with the same real host and label:
    // ACL membership alone must not recreate the previous native lease.
    let recreated = app_with_host(fixture.host.clone());
    let fake = tauri::WebviewWindowBuilder::new(
        &recreated,
        label,
        tauri::WebviewUrl::CustomProtocol("lattice-review://localhost/index.html".parse().unwrap()),
    )
    .build()
    .unwrap();
    assert!(call(
        &fake,
        "native_review_document",
        fake.url().unwrap().as_str()
    )
    .is_err());
}

#[test]
fn a_native_close_notification_invalidates_the_review_before_any_decision() {
    let fixture = super::review_test_support::Fixture::start();
    let app = app_with_host(fixture.host.clone());
    let proposed = tauri::async_runtime::block_on(fixture.host.propose_operation(
        lattice_native_host::review::ProposalInput::CreateDirectory {
            grant_id: fixture.grant_id.clone(),
            relative_path: "closed-dir".into(),
        },
    ))
    .unwrap();
    let main = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    call_input(
        &main,
        "native_open_review",
        main.url().unwrap().as_str(),
        json!({"proposal_id":proposed.proposal_id}),
    )
    .unwrap();
    let window = app
        .webview_windows()
        .into_iter()
        .find(|(label, _)| label.starts_with("native-review-"))
        .unwrap()
        .1;
    // Exercise the production close callback explicitly: MockRuntime does not
    // deliver OS events. Installed WebKit/WebView2 cleanup still needs S2c.6.
    review::window_event(
        &app.get_window(window.label()).unwrap(),
        &tauri::WindowEvent::Destroyed,
    );
    assert!(call(
        &window,
        "native_review_document",
        window.url().unwrap().as_str()
    )
    .is_err());
    assert!(call_input(
        &window,
        "native_review_decide",
        window.url().unwrap().as_str(),
        json!({"proposal_id":proposed.proposal_id,"digest":proposed.digest,"decision":"accept"})
    )
    .is_err());
    let status =
        tauri::async_runtime::block_on(fixture.host.proposal_status(&proposed.proposal_id))
            .unwrap();
    assert_eq!(
        status.status,
        lattice_native_host::review::ProposalState::Denied
    );
    assert!(!fixture.project.join("closed-dir").exists());
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
