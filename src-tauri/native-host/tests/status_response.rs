use lattice_native_host::{Status, TelemetryEvent};
use serde_json::json;

#[test]
fn status_can_cross_the_ipc_response_boundary_without_transport_authority() {
    let event = TelemetryEvent {
        id: None,
        workspace_id: None,
        user_id: "local-user".into(),
        event_type: "read".into(),
        path_accessed: Some("literal/<script>.txt".into()),
        success: true,
        error_message: None,
        duration_ms: Some(3),
        operation_type: None,
        timestamp: "2026-10-31T00:00:00Z".into(),
    };
    let response = serde_json::to_value(Some(Status {
        events: vec![event],
    }))
    .expect("native status must serialize as a Tauri response");
    assert_eq!(
        response["events"][0]["path_accessed"],
        "literal/<script>.txt"
    );
    assert_eq!(response["events"][0]["id"], serde_json::Value::Null);
    assert_eq!(response.as_object().unwrap().len(), 1);
    assert!(response.get("events").unwrap().is_array());
    assert_eq!(
        serde_json::to_value(Some(Status { events: vec![] })).unwrap(),
        json!({ "events": [] })
    );
    assert_eq!(
        serde_json::to_value(None::<Status>).unwrap(),
        serde_json::Value::Null
    );
}
