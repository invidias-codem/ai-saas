//! Isolated, bundled review surface. Labels identify native-created instances
//! and are never reused; no caller can choose one or return a review lease.
use crate::workspace::NativeIpcError;
use lattice_native_host::{
    lifecycle::NativeHost,
    review::{
        DisplayAcknowledgement, ProposalInput, ProposalReference, ProposalState, ProposalSummary,
        ReviewDecision, ReviewDocument, ReviewLease,
    },
    workspace::EmptyInput,
    HostError,
};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use tauri::{Manager, Runtime, WebviewUrl, WebviewWindow};

const REVIEW_URL: &str = "lattice-review://localhost/index.html";
struct Active<R: Runtime> {
    lease: ReviewLease,
    window: Option<WebviewWindow<R>>,
}
pub(crate) struct ReviewWindows<R: Runtime> {
    active: Mutex<Option<Active<R>>>,
}
impl<R: Runtime> Default for ReviewWindows<R> {
    fn default() -> Self {
        Self {
            active: Mutex::new(None),
        }
    }
}

pub(crate) fn review_url(raw: &str) -> bool {
    let Ok(url) = tauri::Url::parse(raw) else {
        return false;
    };
    matches!(
        (url.scheme(), url.host_str()),
        ("lattice-review", Some("localhost")) | ("http", Some("lattice-review.localhost"))
    ) && url.port().is_none()
        && url.username().is_empty()
        && url.password().is_none()
        && url.path() == "/index.html"
        && url.query().is_none()
        && url.fragment().is_none()
}
pub(crate) fn allow_navigation<R: Runtime>(
    app: &tauri::AppHandle<R>,
    label: &str,
    url: &tauri::Url,
) -> bool {
    let Some(state) = app.try_state::<ReviewWindows<R>>() else {
        return false;
    };
    let Ok(active) = state.active.lock() else {
        return false;
    };
    let Some(active) = active.as_ref() else {
        return false;
    };
    if active.lease.label() != label {
        return false;
    }
    if !review_url(url.as_str()) {
        active.lease.deny();
        return false;
    }
    active.lease.is_active()
}
pub(crate) fn window_event<R: Runtime>(window: &tauri::Window<R>, event: &tauri::WindowEvent) {
    let Some(state) = window.app_handle().try_state::<ReviewWindows<R>>() else {
        return;
    };
    let Ok(mut active) = state.active.lock() else {
        return;
    };
    if active
        .as_ref()
        .is_some_and(|a| a.lease.label() == window.label())
    {
        if matches!(
            event,
            tauri::WindowEvent::CloseRequested { .. } | tauri::WindowEvent::Destroyed
        ) {
            if let Some(a) = active.as_ref() {
                a.lease.deny();
            }
        }
        if matches!(event, tauri::WindowEvent::Destroyed) {
            *active = None;
        }
    }
}
fn authorized<R: Runtime>(window: &WebviewWindow<R>) -> Result<ReviewLease, NativeIpcError> {
    let state = window
        .app_handle()
        .try_state::<ReviewWindows<R>>()
        .ok_or(HostError::ReviewDenied)?;
    let active = state.active.lock().map_err(|_| HostError::ReviewDenied)?;
    let active = active.as_ref().ok_or(HostError::ReviewDenied)?;
    // Tauri forbids duplicate live labels; this random label is native-owned,
    // never reused, and revoked before destruction/recreation can occur.
    if active.lease.label() != window.label()
        || window
            .app_handle()
            .get_webview_window(window.label())
            .is_none()
        || !active.lease.is_active()
        || !review_url(window.url().map_err(|_| HostError::ReviewDenied)?.as_str())
    {
        return Err(HostError::ReviewDenied.into());
    }
    Ok(active.lease.clone())
}
pub(crate) fn csp() -> String {
    let policy: std::collections::BTreeMap<String, String> =
        serde_json::from_str(include_str!("../review-assets/policy.json"))
            .expect("bundled review policy must parse");
    policy
        .into_iter()
        .map(|(key, value)| format!("{key} {value}"))
        .collect::<Vec<_>>()
        .join("; ")
}
pub(crate) fn resource(request: tauri::http::Request<Vec<u8>>) -> tauri::http::Response<Vec<u8>> {
    let entry = if request.method() == tauri::http::Method::GET && request.uri().query().is_none() {
        match request.uri().path() {
            "/index.html" => Some((
                "text/html; charset=utf-8",
                include_bytes!("../review-assets/index.html").as_slice(),
            )),
            "/review.js" => Some((
                "text/javascript; charset=utf-8",
                include_bytes!("../review-assets/review.js").as_slice(),
            )),
            "/review.css" => Some((
                "text/css; charset=utf-8",
                include_bytes!("../review-assets/review.css").as_slice(),
            )),
            _ => None,
        }
    } else {
        None
    };
    let (kind, body, status) = match entry {
        Some((kind, body)) => (kind, body, 200),
        None => ("text/plain; charset=utf-8", b"Unavailable".as_slice(), 404),
    };
    tauri::http::Response::builder()
        .status(status)
        .header("Content-Type", kind)
        .header("Content-Security-Policy", csp())
        .header("Cache-Control", "no-store")
        .header("X-Content-Type-Options", "nosniff")
        .header("X-Frame-Options", "DENY")
        .header("Referrer-Policy", "no-referrer")
        .body(body.to_vec())
        .expect("fixed native review response must build")
}

fn cleanup<R: Runtime>(app: &tauri::AppHandle<R>, lease: &ReviewLease) {
    lease.deny();
    if let Some(window) = app.get_webview_window(lease.label()) {
        if window.destroy().is_err() {
            // Keep the slot occupied until a Destroyed event confirms cleanup.
            log::warn!("LOCAL_REVIEW_CLEANUP_UNCONFIRMED");
        }
        return;
    }
    let state = app.state::<ReviewWindows<R>>();
    if let Ok(mut slot) = state.active.lock() {
        if slot
            .as_ref()
            .is_some_and(|a| a.lease.label() == lease.label())
        {
            *slot = None;
        }
    };
}

async fn open<R: Runtime>(
    app: tauri::AppHandle<R>,
    host: Arc<NativeHost>,
    id: String,
) -> Result<(), HostError> {
    let lease = host.begin_review(&id).await?;
    {
        let state = app.state::<ReviewWindows<R>>();
        let mut slot = match state.active.lock() {
            Ok(slot) => slot,
            Err(_) => {
                lease.deny();
                return Err(HostError::StateUnavailable);
            }
        };
        if slot.is_some() {
            lease.deny();
            return Err(HostError::Busy);
        }
        *slot = Some(Active {
            lease: lease.clone(),
            window: None,
        });
    }
    let handle = app.clone();
    let view_lease = lease.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let navigated = AtomicBool::new(false);
        let navigation_lease = view_lease.clone();
        tauri::WebviewWindowBuilder::new(
            &handle,
            view_lease.label(),
            WebviewUrl::CustomProtocol(REVIEW_URL.parse().expect("fixed review URL")),
        )
        .title("Review proposed change · Lattice OS")
        .inner_size(820., 760.)
        .min_inner_size(640., 480.)
        .devtools(false)
        .disable_drag_drop_handler()
        .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
        .on_navigation(move |url| {
            if !review_url(url.as_str())
                || navigated.swap(true, Ordering::AcqRel)
                || !navigation_lease.is_active()
            {
                navigation_lease.deny();
                false
            } else {
                true
            }
        })
        .build()
    })
    .await;
    let window = match result {
        Ok(Ok(window)) => window,
        Ok(Err(_)) | Err(_) => {
            cleanup(&app, &lease);
            return Err(HostError::ReviewDenied);
        }
    };
    let installed = {
        let state = app.state::<ReviewWindows<R>>();
        let guard = state.active.lock();
        match guard {
            Ok(mut slot) => {
                if let Some(active) = slot.as_mut().filter(|a| a.lease.label() == lease.label()) {
                    active.window = Some(window.clone());
                    true
                } else {
                    false
                }
            }
            Err(_) => false,
        }
    };
    if !installed {
        cleanup(&app, &lease);
        return Err(HostError::ReviewDenied);
    }
    tauri::async_runtime::spawn(async move {
        lease.finished().await;
        cleanup(&app, &lease);
        // A denied/expired window must promptly release Go's prepared handles.
        // An accepted proposal keeps its target pin until dispatch or expiry.
        if host
            .proposal_status(&id)
            .await
            .is_ok_and(|s| !matches!(s.status, ProposalState::Accepted | ProposalState::Consumed))
        {
            let _ = host.cancel_proposal(&id).await;
        }
    });
    Ok(())
}

#[tauri::command]
pub(crate) async fn native_propose_operation<R: Runtime>(
    window: WebviewWindow<R>,
    state: tauri::State<'_, Arc<NativeHost>>,
    input: ProposalInput,
) -> Result<ProposalSummary, NativeIpcError> {
    super::require_local_window(&window).map_err(|_| HostError::GrantDenied)?;
    state.propose_operation(input).await.map_err(Into::into)
}
#[tauri::command]
pub(crate) async fn native_proposal_status<R: Runtime>(
    window: WebviewWindow<R>,
    state: tauri::State<'_, Arc<NativeHost>>,
    input: ProposalReference,
) -> Result<ProposalSummary, NativeIpcError> {
    super::require_local_window(&window).map_err(|_| HostError::GrantDenied)?;
    state
        .proposal_status(&input.proposal_id)
        .await
        .map_err(Into::into)
}
#[tauri::command]
pub(crate) async fn native_cancel_proposal<R: Runtime>(
    window: WebviewWindow<R>,
    state: tauri::State<'_, Arc<NativeHost>>,
    input: ProposalReference,
) -> Result<(), NativeIpcError> {
    super::require_local_window(&window).map_err(|_| HostError::GrantDenied)?;
    state
        .cancel_proposal(&input.proposal_id)
        .await
        .map_err(Into::into)
}
#[tauri::command]
pub(crate) async fn native_open_review<R: Runtime>(
    window: WebviewWindow<R>,
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, Arc<NativeHost>>,
    input: ProposalReference,
) -> Result<(), NativeIpcError> {
    super::require_local_window(&window).map_err(|_| HostError::GrantDenied)?;
    let host = state.inner().clone();
    tauri::async_runtime::spawn(async move { open(app, host, input.proposal_id).await })
        .await
        .map_err(|_| HostError::ReviewDenied)?
        .map_err(Into::into)
}
#[tauri::command]
pub(crate) async fn native_review_document<R: Runtime>(
    window: WebviewWindow<R>,
    state: tauri::State<'_, Arc<NativeHost>>,
    input: EmptyInput,
) -> Result<ReviewDocument, NativeIpcError> {
    let EmptyInput {} = input;
    let lease = authorized(&window)?;
    state.review_document(&lease).await.map_err(Into::into)
}
#[tauri::command]
pub(crate) async fn native_review_ready<R: Runtime>(
    window: WebviewWindow<R>,
    state: tauri::State<'_, Arc<NativeHost>>,
    input: DisplayAcknowledgement,
) -> Result<(), NativeIpcError> {
    let lease = authorized(&window)?;
    state
        .acknowledge_review(&lease, input)
        .await
        .map_err(Into::into)
}
#[tauri::command]
pub(crate) async fn native_review_decide<R: Runtime>(
    window: WebviewWindow<R>,
    state: tauri::State<'_, Arc<NativeHost>>,
    input: ReviewDecision,
) -> Result<(), NativeIpcError> {
    let lease = authorized(&window)?;
    state.decide_review(&lease, input).await.map_err(Into::into)
}
#[tauri::command]
pub(crate) async fn native_review_cancel<R: Runtime>(
    window: WebviewWindow<R>,
    input: EmptyInput,
) -> Result<(), NativeIpcError> {
    let EmptyInput {} = input;
    authorized(&window)?.deny();
    Ok(())
}
