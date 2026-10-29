//! Native-owned directory selection and typed read-only workspace operations.
//! Paths and confirmation decisions enter through the native adapter, not IPC.
use crate::{
    authority::{random_id, Authority},
    HostError, RpcSession,
};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use std::{
    future::Future,
    path::{Path, PathBuf},
    pin::Pin,
    sync::atomic::{AtomicBool, Ordering},
};

pub const MAX_TEXT_BYTES: usize = 256 * 1024;
pub const MAX_DIRECTORY_ENTRIES: usize = 10_000;
const MAX_GRANTS: usize = 32;

pub type DialogFuture<'a, T> = Pin<Box<dyn Future<Output = Result<T, HostError>> + Send + 'a>>;

/// Trusted platform adapter. No frontend command accepts a path or decision.
pub trait FolderPicker: Send + Sync {
    fn pick_folder(&self) -> DialogFuture<'_, Option<PathBuf>>;
    fn confirm_read_access(&self, path: String) -> DialogFuture<'_, bool>;
}
/// Separate trusted native consent, never a frontend boolean or permission flag.
pub trait WriteConsent: Send + Sync {
    fn confirm_write_access(&self, grant: GrantInfo) -> DialogFuture<'_, bool>;
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ReadInput {
    pub grant_id: String,
    pub relative_path: String,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GrantReference {
    pub grant_id: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct EmptyInput {}

#[derive(Clone, Serialize)]
pub struct GrantInfo {
    pub grant_id: String,
    pub display_path: String,
    pub read_only: bool,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TextRead {
    pub content: String,
    pub byte_count: usize,
}
#[derive(Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum FileKind {
    File,
    Directory,
    Symlink,
    Other,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FileStat {
    pub kind: FileKind,
    pub size: u64,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DirectoryEntry {
    pub name: String,
    pub kind: FileKind,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DirectoryList {
    pub entries: Vec<DirectoryEntry>,
}

#[derive(Clone, PartialEq, Eq, Serialize)]
struct DirectoryIdentity {
    volume: String,
    file: String,
}
#[derive(Clone, Serialize)]
struct DaemonGrant {
    grant_id: String,
    path: String,
    directory_identity: DirectoryIdentity,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    writable: bool,
}
impl DaemonGrant {
    fn info(&self) -> GrantInfo {
        GrantInfo {
            grant_id: self.grant_id.clone(),
            display_path: self.path.clone(),
            read_only: !self.writable,
        }
    }
}
#[derive(Default)]
pub(crate) struct GrantState {
    pub(crate) revision: u64,
    grants: Vec<DaemonGrant>,
}
impl GrantState {
    pub(crate) fn review_grant(&self, id: &str) -> Option<GrantInfo> {
        self.grants
            .iter()
            .find(|g| g.grant_id == id)
            .map(DaemonGrant::info)
    }
}
#[derive(Serialize)]
struct GrantSnapshot<'a> {
    next_revision: u64,
    grants: &'a [DaemonGrant],
}
#[derive(Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
struct GrantAcknowledgement {
    protocol_version: u32,
    authority: Authority,
    grant_ids: Vec<String>,
}

// Dropping an in-flight control future has an unknown remote outcome. Poison
// admission unless the exact acknowledgement was validated and published.
struct MutationGuard<'a> {
    blocked: &'a AtomicBool,
    committed: bool,
}
impl Drop for MutationGuard<'_> {
    fn drop(&mut self) {
        if !self.committed {
            self.blocked.store(true, Ordering::Release);
        }
    }
}

struct SelectedDirectory {
    path: String,
    identity: DirectoryIdentity,
    // Keep the selected object alive until Go pins and acknowledges it, so its
    // OS identity cannot be recycled between confirmation and installation.
    _handle: std::fs::File,
}
impl SelectedDirectory {
    fn open(path: &Path) -> Result<Self, HostError> {
        if !path.is_absolute() {
            return Err(HostError::SelectionInvalid);
        }
        let path = std::fs::canonicalize(path).map_err(|_| HostError::SelectionInvalid)?;
        let mut options = std::fs::OpenOptions::new();
        options.read(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.custom_flags(libc::O_DIRECTORY | libc::O_NOFOLLOW | libc::O_NONBLOCK);
        }
        #[cfg(windows)]
        {
            use std::os::windows::fs::OpenOptionsExt;
            use windows_sys::Win32::Storage::FileSystem::FILE_FLAG_BACKUP_SEMANTICS;
            options.custom_flags(FILE_FLAG_BACKUP_SEMANTICS);
        }
        let handle = options
            .open(&path)
            .map_err(|_| HostError::SelectionInvalid)?;
        let metadata = handle.metadata().map_err(|_| HostError::SelectionInvalid)?;
        if !metadata.is_dir() {
            return Err(HostError::SelectionInvalid);
        }
        let identity = directory_identity(&handle, &metadata)?;
        let display = display_path(&path)?;
        if display.len() > 32768 || display.chars().any(unsafe_character) {
            return Err(HostError::SelectionInvalid);
        }
        Ok(Self {
            path: display,
            identity,
            _handle: handle,
        })
    }
}

#[cfg(not(windows))]
fn display_path(path: &Path) -> Result<String, HostError> {
    path.to_str()
        .map(str::to_owned)
        .ok_or(HostError::SelectionInvalid)
}
#[cfg(windows)]
fn display_path(path: &Path) -> Result<String, HostError> {
    use std::path::{Component, Prefix};
    // A Windows local grant is a disk directory, never a device or UNC path.
    match path.components().next() {
        Some(Component::Prefix(p))
            if matches!(p.kind(), Prefix::Disk(_) | Prefix::VerbatimDisk(_)) => {}
        _ => return Err(HostError::SelectionInvalid),
    }
    let raw = path.to_str().ok_or(HostError::SelectionInvalid)?;
    Ok(raw.strip_prefix(r"\\?\").unwrap_or(raw).to_owned())
}

#[cfg(unix)]
fn directory_identity(
    _: &std::fs::File,
    metadata: &std::fs::Metadata,
) -> Result<DirectoryIdentity, HostError> {
    use std::os::unix::fs::MetadataExt;
    Ok(DirectoryIdentity {
        volume: format!("{:016x}", metadata.dev()),
        file: format!("{:016x}", metadata.ino()),
    })
}
#[cfg(windows)]
fn directory_identity(
    file: &std::fs::File,
    _: &std::fs::Metadata,
) -> Result<DirectoryIdentity, HostError> {
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::Storage::FileSystem::{
        FileIdInfo, GetFileInformationByHandleEx, FILE_ID_INFO,
    };
    let mut info = FILE_ID_INFO::default();
    // The live File owns a valid directory handle for the whole native call.
    if unsafe {
        GetFileInformationByHandleEx(
            file.as_raw_handle(),
            FileIdInfo,
            (&mut info as *mut FILE_ID_INFO).cast(),
            std::mem::size_of::<FILE_ID_INFO>() as u32,
        )
    } == 0
        || info.FileId.Identifier == [0; 16]
    {
        return Err(HostError::SelectionInvalid);
    }
    Ok(DirectoryIdentity {
        volume: format!("{:016x}", info.VolumeSerialNumber),
        file: info
            .FileId
            .Identifier
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect(),
    })
}

fn unsafe_character(c: char) -> bool {
    c.is_control()
        || ('\u{202a}'..='\u{202e}').contains(&c)
        || ('\u{2066}'..='\u{2069}').contains(&c)
}

/// The pinned rfd GTK backend passes descriptions to a printf-style function.
/// Escape its format metacharacter while leaving the displayed text unchanged.
/// Windows/macOS dialogs consume plain text and must not receive this escaping.
pub fn native_dialog_text(text: &str) -> String {
    if cfg!(any(
        target_os = "linux",
        target_os = "freebsd",
        target_os = "openbsd",
        target_os = "netbsd",
        target_os = "dragonfly"
    )) {
        text.replace('%', "%%")
    } else {
        text.to_owned()
    }
}

/// Portable spelling shared with Go's final descriptor boundary. This is an
/// admission check, never a substitute for the daemon's os.Root confinement.
pub fn valid_relative_path(path: &str) -> bool {
    if path.is_empty()
        || path.len() > 4096
        || path
            .chars()
            .any(|c| unsafe_character(c) || r#"\:<>"|?*"#.contains(c))
    {
        return false;
    }
    if path == "." {
        return true;
    }
    path.split('/').all(|part| {
        if part.is_empty() || part == "." || part == ".." || part.ends_with([' ', '.']) {
            return false;
        }
        let base = part
            .split('.')
            .next()
            .unwrap_or("")
            .trim_end_matches(' ')
            .to_uppercase();
        let port = base
            .strip_prefix("COM")
            .or_else(|| base.strip_prefix("LPT"));
        !matches!(
            base.as_str(),
            "CON" | "PRN" | "AUX" | "NUL" | "CLOCK$" | "CONIN$" | "CONOUT$"
        ) && !port.is_some_and(|s| s.chars().count() == 1 && "123456789¹²³".contains(s))
    })
}

impl RpcSession {
    pub(crate) fn ensure_workspace(&self) -> Result<(), HostError> {
        if *self.closed.borrow() || self.authority.get().is_none() {
            return Err(HostError::Closed);
        }
        if self.workspace_blocked.load(Ordering::Acquire) {
            return Err(HostError::WorkspaceBlocked);
        }
        Ok(())
    }
    pub(crate) fn is_workspace_blocked(&self) -> bool {
        self.workspace_blocked.load(Ordering::Acquire)
    }
    pub async fn workspace_grants(&self) -> Result<Vec<GrantInfo>, HostError> {
        self.ensure_workspace()?;
        let state = self.grants.try_read().map_err(|_| HostError::Busy)?;
        Ok(state.grants.iter().map(DaemonGrant::info).collect())
    }
    pub async fn select_folder<P: FolderPicker>(
        &self,
        picker: &P,
    ) -> Result<Option<GrantInfo>, HostError> {
        self.ensure_workspace()?;
        let _selection = self.selection.try_lock().map_err(|_| HostError::Busy)?;
        let mut cancelled = self.closed.subscribe();
        if *cancelled.borrow() {
            return Err(HostError::Closed);
        }
        tokio::select! {
            _ = cancelled.changed() => Err(HostError::Closed),
            result = self.select_folder_inner(picker) => result,
        }
    }
    async fn select_folder_inner<P: FolderPicker>(
        &self,
        picker: &P,
    ) -> Result<Option<GrantInfo>, HostError> {
        let revision = {
            let state = self.grants.try_read().map_err(|_| HostError::Busy)?;
            if state.grants.len() >= MAX_GRANTS {
                return Err(HostError::GrantDenied);
            }
            state.revision
        };
        let Some(path) = picker.pick_folder().await? else {
            return Ok(None);
        };
        let selected = tokio::task::spawn_blocking(move || SelectedDirectory::open(&path))
            .await
            .map_err(|_| HostError::SelectionInvalid)??;
        self.ensure_workspace()?;
        if !picker.confirm_read_access(selected.path.clone()).await? {
            return Ok(None);
        }
        let mut state = self.grants.write().await;
        self.ensure_workspace()?;
        if state.revision != revision {
            return Err(HostError::GrantDenied);
        }
        let grant = DaemonGrant {
            grant_id: format!("local-grant-{}", random_id()?),
            path: selected.path.clone(),
            directory_identity: selected.identity.clone(),
            writable: false,
        };
        let info = grant.info();
        let mut next = state.grants.clone();
        next.push(grant);
        self.install_grants(&mut state, next).await?;
        Ok(Some(info))
    }
    pub async fn request_write_access<C: WriteConsent>(
        &self,
        id: &str,
        consent: &C,
    ) -> Result<GrantInfo, HostError> {
        self.ensure_workspace()?;
        let _selection = self.selection.try_lock().map_err(|_| HostError::Busy)?;
        let (grant, revision) = {
            let state = self.grants.try_read().map_err(|_| HostError::Busy)?;
            (
                state
                    .grants
                    .iter()
                    .find(|g| g.grant_id == id)
                    .cloned()
                    .ok_or(HostError::GrantDenied)?,
                state.revision,
            )
        };
        if grant.writable {
            return Ok(grant.info());
        }
        let path = PathBuf::from(&grant.path);
        let selected = tokio::task::spawn_blocking(move || SelectedDirectory::open(&path))
            .await
            .map_err(|_| HostError::SelectionInvalid)??;
        if selected.path != grant.path || selected.identity != grant.directory_identity {
            return Err(HostError::GrantDenied);
        }
        let mut cancelled = self.closed.subscribe();
        if *cancelled.borrow() {
            return Err(HostError::Closed);
        }
        let allowed = tokio::select! {
            _ = cancelled.changed() => return Err(HostError::Closed),
            result = consent.confirm_write_access(grant.info()) => result?,
        };
        if !allowed {
            return Err(HostError::ReviewDenied);
        }
        let path = PathBuf::from(&grant.path);
        let current = tokio::task::spawn_blocking(move || SelectedDirectory::open(&path))
            .await
            .map_err(|_| HostError::SelectionInvalid)??;
        if current.path != selected.path || current.identity != selected.identity {
            return Err(HostError::GrantDenied);
        }
        let mut state = self.grants.write().await;
        self.ensure_workspace()?;
        if state.revision != revision {
            return Err(HostError::GrantDenied);
        }
        let mut next = state.grants.clone();
        let grant = next
            .iter_mut()
            .find(|g| g.grant_id == id)
            .ok_or(HostError::GrantDenied)?;
        grant.writable = true;
        let info = grant.info();
        self.install_grants(&mut state, next).await?;
        Ok(info)
    }
    pub async fn revoke_grant(&self, id: &str) -> Result<(), HostError> {
        self.ensure_workspace()?;
        let mut state = self.grants.write().await;
        self.ensure_workspace()?;
        if !state.grants.iter().any(|g| g.grant_id == id) {
            return Err(HostError::GrantDenied);
        }
        let next = state
            .grants
            .iter()
            .filter(|g| g.grant_id != id)
            .cloned()
            .collect();
        self.install_grants(&mut state, next).await
    }
    async fn install_grants(
        &self,
        state: &mut GrantState,
        next: Vec<DaemonGrant>,
    ) -> Result<(), HostError> {
        self.invalidate_reviews();
        let Some(revision) = state.revision.checked_add(1) else {
            self.workspace_blocked.store(true, Ordering::Release);
            return Err(HostError::WorkspaceBlocked);
        };
        let current = self
            .authority
            .get()
            .ok_or(HostError::Closed)?
            .with_grant_revision(state.revision);
        let expected = GrantAcknowledgement {
            protocol_version: 1,
            authority: current.with_grant_revision(revision),
            grant_ids: next.iter().map(|g| g.grant_id.clone()).collect(),
        };
        let inputs = serde_json::to_value(GrantSnapshot {
            next_revision: revision,
            grants: &next,
        })
        .map_err(|_| HostError::StateUnavailable)?;
        let mut mutation = MutationGuard {
            blocked: &self.workspace_blocked,
            committed: false,
        };
        let mut cancelled = self.closed.subscribe();
        if *cancelled.borrow() {
            return Err(HostError::WorkspaceBlocked);
        }
        let response = tokio::select! {
            _ = cancelled.changed() => Err(HostError::Closed),
            response = self.request_authority("native_update_grants", inputs, Some(&current)) => response,
        };
        let ack: GrantAcknowledgement = response
            .and_then(|v| serde_json::from_value(v).map_err(|_| HostError::InvalidResponse))
            .map_err(|_| HostError::WorkspaceBlocked)?;
        if ack != expected || *cancelled.borrow() {
            return Err(HostError::WorkspaceBlocked);
        }
        state.revision = revision;
        state.grants = next;
        mutation.committed = true;
        Ok(())
    }
    async fn read_typed<T: DeserializeOwned>(
        &self,
        action: &'static str,
        input: ReadInput,
    ) -> Result<T, HostError> {
        self.ensure_workspace()?;
        if !valid_relative_path(&input.relative_path) {
            return Err(HostError::PathInvalid);
        }
        let state = self.grants.try_read().map_err(|_| HostError::Busy)?;
        if !state.grants.iter().any(|g| g.grant_id == input.grant_id) {
            return Err(HostError::GrantDenied);
        }
        let _permit = self.permits.try_acquire().map_err(|_| HostError::Busy)?;
        let authority = self
            .authority
            .get()
            .ok_or(HostError::Closed)?
            .with_grant_revision(state.revision);
        let inputs = serde_json::to_value(input).map_err(|_| HostError::PathInvalid)?;
        let mut cancelled = self.closed.subscribe();
        if *cancelled.borrow() {
            return Err(HostError::Closed);
        }
        let data = tokio::select! {
            _ = cancelled.changed() => return Err(HostError::Closed),
            data = self.request_authority(action, inputs, Some(&authority)) => data?,
        };
        self.ensure_workspace()?;
        serde_json::from_value(data).map_err(|_| HostError::InvalidResponse)
    }
    pub async fn read_text(&self, input: ReadInput) -> Result<TextRead, HostError> {
        let text: TextRead = self.read_typed("native_read_text", input).await?;
        if text.content.len() > MAX_TEXT_BYTES
            || text.content.len() != text.byte_count
            || text.content.contains('\0')
        {
            return Err(HostError::InvalidResponse);
        }
        Ok(text)
    }
    pub async fn list_directory(&self, input: ReadInput) -> Result<DirectoryList, HostError> {
        let list: DirectoryList = self.read_typed("native_list", input).await?;
        if list.entries.len() > MAX_DIRECTORY_ENTRIES
            || serde_json::to_vec(&list)
                .map_err(|_| HostError::InvalidResponse)?
                .len()
                > 1024 * 1024
        {
            return Err(HostError::InvalidResponse);
        }
        Ok(list)
    }
    pub async fn stat_path(&self, input: ReadInput) -> Result<FileStat, HostError> {
        self.read_typed("native_stat", input).await
    }
}

#[cfg(test)]
mod path_tests {
    use super::valid_relative_path;
    #[test]
    fn rust_and_go_share_portable_path_admission_fixtures() {
        let fixtures: serde_json::Value =
            serde_json::from_str(include_str!("../../../testdata/native-relative-paths.json"))
                .unwrap();
        for value in fixtures["valid"].as_array().unwrap() {
            assert!(
                valid_relative_path(value.as_str().unwrap()),
                "rejected {value}"
            );
        }
        for value in fixtures["invalid"].as_array().unwrap() {
            assert!(
                !valid_relative_path(value.as_str().unwrap()),
                "accepted {value}"
            );
        }
    }

    #[test]
    fn native_confirmation_displays_percent_directives_as_literal_folder_text() {
        let text = "/selected/100%ready/%s%n%p%%/资料";
        let formatted = super::native_dialog_text(text);
        #[cfg(any(
            target_os = "linux",
            target_os = "freebsd",
            target_os = "openbsd",
            target_os = "netbsd",
            target_os = "dragonfly"
        ))]
        {
            use std::ffi::{CStr, CString};
            // Validate before exercising C formatting so a regressed sanitizer
            // cannot execute the adversarial directives inside this test.
            assert_eq!(formatted, "/selected/100%%ready/%%s%%n%%p%%%%/资料");
            let format = CString::new(formatted).unwrap();
            let mut output = vec![0 as libc::c_char; 1024];
            let size =
                unsafe { libc::snprintf(output.as_mut_ptr(), output.len(), format.as_ptr()) };
            assert!(size >= 0 && (size as usize) < output.len());
            assert_eq!(
                unsafe { CStr::from_ptr(output.as_ptr()) }.to_str().unwrap(),
                text
            );
        }
        #[cfg(not(any(
            target_os = "linux",
            target_os = "freebsd",
            target_os = "openbsd",
            target_os = "netbsd",
            target_os = "dragonfly"
        )))]
        assert_eq!(formatted, text);
    }
}
