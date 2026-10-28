//! The webview supplies references and relative paths, never grant snapshots,
//! selected absolute paths, local identity or a confirmation decision.
use lattice_native_host::{
    lifecycle::NativeHost,
    workspace::{
        DialogFuture, DirectoryList, EmptyInput, FileStat, FolderPicker, GrantInfo, GrantReference,
        ReadInput, TextRead,
    },
    HostError,
};
use serde::Serialize;
use std::{path::PathBuf, sync::Arc};
use tauri::Manager;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

#[derive(Serialize)]
pub(crate) struct NativeIpcError {
    code: &'static str,
    message: &'static str,
}
impl From<HostError> for NativeIpcError {
    fn from(error: HostError) -> Self {
        Self {
            code: error.code(),
            message: error.message(),
        }
    }
}
fn require_workspace_window<R: tauri::Runtime>(
    window: &tauri::WebviewWindow<R>,
) -> Result<(), NativeIpcError> {
    super::require_local_window(window).map_err(|_| HostError::GrantDenied.into())
}

struct NativeFolderPicker<R: tauri::Runtime> {
    window: tauri::WebviewWindow<R>,
}
impl<R: tauri::Runtime> FolderPicker for NativeFolderPicker<R> {
    fn pick_folder(&self) -> DialogFuture<'_, Option<PathBuf>> {
        Box::pin(async move {
            super::require_local_window(&self.window).map_err(|_| HostError::GrantDenied)?;
            #[cfg(desktop)]
            {
                let (send, receive) = tokio::sync::oneshot::channel();
                self.window
                    .app_handle()
                    .dialog()
                    .file()
                    .set_parent(&self.window)
                    .set_title("Select a folder for read access")
                    .set_can_create_directories(false)
                    .pick_folder(move |path| {
                        let _ = send.send(path);
                    });
                let path = receive.await.map_err(|_| HostError::SelectionInvalid)?;
                path.map(|p| p.into_path().map_err(|_| HostError::SelectionInvalid))
                    .transpose()
            }
            #[cfg(not(desktop))]
            {
                Err(HostError::SelectionInvalid)
            }
        })
    }
    fn confirm_read_access(&self, path: String) -> DialogFuture<'_, bool> {
        Box::pin(async move {
            super::require_local_window(&self.window).map_err(|_| HostError::GrantDenied)?;
            let (send, receive) = tokio::sync::oneshot::channel();
            let platform_note = if cfg!(windows) {
                "\nOn Windows, revoke this access before moving or renaming the folder."
            } else {
                ""
            };
            self.window.app_handle().dialog()
                .message(format!("Allow Lattice OS to list files and preview UTF-8 text in this folder?\n\n{path}\n\nRead access only. You can revoke access during this session.{platform_note}"))
                .title("Confirm folder read access").parent(&self.window)
                .kind(MessageDialogKind::Info)
                .buttons(MessageDialogButtons::OkCancelCustom("Allow read access".into(),"Cancel".into()))
                .show(move |allowed| { let _ = send.send(allowed); });
            let allowed = receive.await.map_err(|_| HostError::SelectionInvalid)?;
            super::require_local_window(&self.window).map_err(|_| HostError::GrantDenied)?;
            Ok(allowed)
        })
    }
}

pub(crate) fn boundary<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("local-workspace")
        .on_navigation(|webview, url| {
            lattice_native_host::permits_window(
                webview.label(),
                url.as_str(),
                cfg!(debug_assertions),
            )
        })
        .build()
}

#[tauri::command]
pub(crate) async fn native_select_folder<R: tauri::Runtime>(
    window: tauri::WebviewWindow<R>,
    state: tauri::State<'_, Arc<NativeHost>>,
    input: EmptyInput,
) -> Result<Option<GrantInfo>, NativeIpcError> {
    require_workspace_window(&window)?;
    let EmptyInput {} = input;
    state
        .select_folder(NativeFolderPicker { window })
        .await
        .map_err(Into::into)
}
#[tauri::command]
pub(crate) async fn native_workspace_grants<R: tauri::Runtime>(
    window: tauri::WebviewWindow<R>,
    state: tauri::State<'_, Arc<NativeHost>>,
    input: EmptyInput,
) -> Result<Vec<GrantInfo>, NativeIpcError> {
    require_workspace_window(&window)?;
    let EmptyInput {} = input;
    state.workspace_grants().await.map_err(Into::into)
}
#[tauri::command]
pub(crate) async fn native_revoke_grant<R: tauri::Runtime>(
    window: tauri::WebviewWindow<R>,
    state: tauri::State<'_, Arc<NativeHost>>,
    input: GrantReference,
) -> Result<(), NativeIpcError> {
    require_workspace_window(&window)?;
    state.revoke_grant(input.grant_id).await.map_err(Into::into)
}
#[tauri::command]
pub(crate) async fn native_list<R: tauri::Runtime>(
    window: tauri::WebviewWindow<R>,
    state: tauri::State<'_, Arc<NativeHost>>,
    input: ReadInput,
) -> Result<DirectoryList, NativeIpcError> {
    require_workspace_window(&window)?;
    state.list_directory(input).await.map_err(Into::into)
}
#[tauri::command]
pub(crate) async fn native_stat<R: tauri::Runtime>(
    window: tauri::WebviewWindow<R>,
    state: tauri::State<'_, Arc<NativeHost>>,
    input: ReadInput,
) -> Result<FileStat, NativeIpcError> {
    require_workspace_window(&window)?;
    state.stat_path(input).await.map_err(Into::into)
}
#[tauri::command]
pub(crate) async fn native_read_text<R: tauri::Runtime>(
    window: tauri::WebviewWindow<R>,
    state: tauri::State<'_, Arc<NativeHost>>,
    input: ReadInput,
) -> Result<TextRead, NativeIpcError> {
    require_workspace_window(&window)?;
    state.read_text(input).await.map_err(Into::into)
}
