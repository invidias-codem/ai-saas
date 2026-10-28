use serde_json::{json, Value};
use std::sync::{Arc, Mutex};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
};

pub async fn fixture(
    fault: &'static str,
) -> (u16, Arc<Mutex<Vec<Value>>>, tokio::task::JoinHandle<()>) {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let requests = Arc::new(Mutex::new(Vec::new()));
    let capture = requests.clone();
    let task = tokio::spawn(async move {
        loop {
            let (mut stream, _) = listener.accept().await.unwrap();
            let mut bytes = Vec::new();
            let body_start = loop {
                let mut chunk = [0u8; 4096];
                let n = stream.read(&mut chunk).await.unwrap();
                assert!(n > 0 && bytes.len() < 16384);
                bytes.extend_from_slice(&chunk[..n]);
                if let Some(p) = bytes.windows(4).position(|s| s == b"\r\n\r\n") {
                    break p + 4;
                }
            };
            let headers = String::from_utf8_lossy(&bytes[..body_start]);
            let length: usize = headers
                .lines()
                .find_map(|l| {
                    l.to_ascii_lowercase()
                        .strip_prefix("content-length:")
                        .map(|s| s.trim().parse().unwrap())
                })
                .unwrap();
            while bytes.len() < body_start + length {
                let mut chunk = [0u8; 4096];
                let n = stream.read(&mut chunk).await.unwrap();
                assert!(n > 0);
                bytes.extend_from_slice(&chunk[..n]);
            }
            let request: Value =
                serde_json::from_slice(&bytes[body_start..body_start + length]).unwrap();
            capture.lock().unwrap().push(request.clone());
            let mut data = match request["action"].as_str().unwrap() {
                "native_protocol" => {
                    json!({"protocol_version":1,"mode":"local","features":["session-authority-v1","native-action-allowlist-v1","read-grants-v1"]})
                }
                "bind_native_session" => request["inputs"].clone(),
                "status" => json!({"status":"ok","recent_events":[],"event_count":0}),
                "native_update_grants" => {
                    let mut authority = request["authority"].clone();
                    authority["grant_revision"] = request["inputs"]["next_revision"].clone();
                    json!({"protocol_version":1,"authority":authority,"grant_ids":request["inputs"]["grants"].as_array().unwrap().iter().map(|g|g["grant_id"].clone()).collect::<Vec<_>>()})
                }
                "native_read_text" => json!({"content":"selected text","byte_count":13}),
                "native_list" => json!({"entries":[{"name":"note.md","kind":"file"}]}),
                "native_stat" => json!({"kind":"file","size":13}),
                _ => panic!("unexpected privileged action"),
            };
            if request["action"] == "native_protocol" {
                match fault {
                    "version" => data["protocol_version"] = json!(2),
                    "mode" => data["mode"] = json!("standalone"),
                    "features" => data["features"] = json!([]),
                    "old-grants" => {
                        data["features"] =
                            json!(["session-authority-v1", "native-action-allowlist-v1"])
                    }
                    "unknown" => data["approved"] = json!(true),
                    _ => {}
                }
            }
            if fault == "ack" && request["action"] == "bind_native_session" {
                data["authority"]["workspace_id"] = json!("another-workspace");
            }
            if request["action"] == "native_update_grants" {
                if fault == "grant_ack" {
                    data["authority"]["grant_revision"] = json!(99);
                }
                if fault == "grant_timeout" {
                    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                }
            }
            if fault == "slow_read" && request["action"] == "native_read_text" {
                tokio::time::sleep(std::time::Duration::from_millis(400)).await;
            }
            let body = json!({"id":request["id"],"jsonrpc":"2.0","result":{"ok":true,"data":data}})
                .to_string();
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            );
            stream.write_all(response.as_bytes()).await.unwrap();
        }
    });
    (port, requests, task)
}
