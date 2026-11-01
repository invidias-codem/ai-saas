use serde_json::{json, Value};
use std::io::{ErrorKind, Write};
use std::path::{Path, PathBuf};

pub(crate) fn root_for_channel(base: &Path, channel: &str) -> Result<PathBuf, String> {
    match channel {
        "stable" => Ok(base.join("xyz.gen1e.lattice-os")),
        "preview" => Ok(base.join("xyz.gen1e.lattice-os.preview")),
        _ => Err("Invalid channel".into()),
    }
}

pub(crate) fn native_root(channel: &str) -> Result<PathBuf, String> {
    let base = if cfg!(target_os = "windows") {
        std::env::var_os("LOCALAPPDATA")
            .or_else(|| std::env::var_os("APPDATA"))
            .map(PathBuf::from)
            .ok_or("Could not determine app data directory")?
    } else {
        PathBuf::from(std::env::var_os("HOME").ok_or("Could not determine home directory")?)
            .join(".local/share")
    };
    if !base.is_absolute() {
        return Err("App data directory must be absolute".into());
    }
    root_for_channel(&base, channel)
}

fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

fn directory(root: &Path, segments: &[&str], create: bool) -> Result<Option<PathBuf>, String> {
    if create {
        std::fs::create_dir_all(root).map_err(|error| error.to_string())?;
    }
    let canonical_root = match root.canonicalize() {
        Ok(root) => root,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.to_string()),
    };
    let mut current = canonical_root.clone();
    for segment in segments {
        current = current.join(segment);
        if create {
            match std::fs::create_dir(&current) {
                Ok(()) => {}
                Err(error) if error.kind() == ErrorKind::AlreadyExists => {}
                Err(error) => return Err(error.to_string()),
            }
        }
        let metadata = match std::fs::symlink_metadata(&current) {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(error.to_string()),
        };
        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            return Err("Profile directories must not be links or files".into());
        }
        current = current.canonicalize().map_err(|error| error.to_string())?;
        if !current.starts_with(&canonical_root) {
            return Err("Path traversal attempt blocked".into());
        }
    }
    Ok(Some(current))
}

fn config_path(root: &Path, profile_id: &str, create: bool) -> Result<Option<PathBuf>, String> {
    if !valid_id(profile_id) {
        return Err("Invalid profile ID".into());
    }
    let Some(directory) = directory(root, &["profiles", profile_id], create)? else {
        return Ok(None);
    };
    let path = directory.join("config.json");
    match std::fs::symlink_metadata(&path) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_file() => {
            return Err("Profile configuration must be a regular file".into())
        }
        Err(error) if error.kind() != ErrorKind::NotFound => return Err(error.to_string()),
        _ => {}
    }
    Ok(Some(path))
}

pub(crate) fn paths(root: &Path) -> Value {
    let profiles = root.join("profiles");
    let profile = profiles.join("{profileId}");
    json!({
        "root": format!("{}{separator}", root.display(), separator = std::path::MAIN_SEPARATOR),
        "profilesRoot": format!("{}{separator}", profiles.display(), separator = std::path::MAIN_SEPARATOR),
        "profileConfigTemplate": profile.join("config.json").to_string_lossy(),
        "profileStateTemplate": profile.join("state.sqlite").to_string_lossy(),
        "profileLogsTemplate": format!("{}{separator}", profile.join("logs").display(), separator = std::path::MAIN_SEPARATOR),
        "profileCacheTemplate": format!("{}{separator}", profile.join("cache").display(), separator = std::path::MAIN_SEPARATOR),
    })
}

pub(crate) fn load(root: &Path, profile_id: &str) -> Result<Option<Value>, String> {
    let Some(path) = config_path(root, profile_id, false)? else {
        return Ok(None);
    };
    match std::fs::read_to_string(path) {
        Ok(content) => serde_json::from_str(&content)
            .map(Some)
            .map_err(|error| error.to_string()),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

pub(crate) fn save(root: &Path, profile_id: &str, settings: &Value) -> Result<(), String> {
    if settings.get("profileId").and_then(Value::as_str) != Some(profile_id)
        || settings.get("version").and_then(Value::as_u64) != Some(1)
    {
        return Err("Profile ID or settings version does not match".into());
    }
    let path = config_path(root, profile_id, true)?.ok_or("Profile directory is unavailable")?;
    let mut temporary =
        tempfile::NamedTempFile::new_in(path.parent().ok_or("Profile directory is unavailable")?)
            .map_err(|error| error.to_string())?;
    let content = serde_json::to_vec_pretty(settings).map_err(|error| error.to_string())?;
    temporary
        .write_all(&content)
        .map_err(|error| error.to_string())?;
    temporary
        .as_file()
        .sync_all()
        .map_err(|error| error.to_string())?;
    temporary
        .persist(path)
        .map_err(|error| error.error.to_string())?;
    Ok(())
}

pub(crate) fn list(root: &Path) -> Result<Vec<String>, String> {
    let Some(directory) = directory(root, &["profiles"], false)? else {
        return Ok(vec![]);
    };
    let mut ids = Vec::new();
    for entry in std::fs::read_dir(directory).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let id = entry.file_name().to_string_lossy().into_owned();
        if valid_id(&id)
            && entry
                .file_type()
                .map_err(|error| error.to_string())?
                .is_dir()
        {
            ids.push(id);
        }
    }
    ids.sort();
    Ok(ids)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fresh_profiles_load_defaults_and_can_be_saved_updated_and_reopened() {
        let temporary = tempfile::tempdir().unwrap();
        let root = root_for_channel(temporary.path(), "stable").unwrap();
        assert_eq!(load(&root, "first-profile").unwrap(), None);
        assert!(list(&root).unwrap().is_empty());
        let mut settings = json!({"profileId":"first-profile","version":1,"connections":[]});
        save(&root, "first-profile", &settings).unwrap();
        settings["connections"] = json!([{"id":"test-connection"}]);
        save(&root, "first-profile", &settings).unwrap();
        assert_eq!(load(&root, "first-profile").unwrap(), Some(settings));
        assert_eq!(list(&root).unwrap(), vec!["first-profile"]);
        assert_eq!(
            std::fs::read_dir(root.join("profiles/first-profile"))
                .unwrap()
                .count(),
            1
        );
    }

    #[test]
    fn channels_are_separate_and_invalid_ids_or_payloads_cannot_write() {
        let temporary = tempfile::tempdir().unwrap();
        let stable = root_for_channel(temporary.path(), "stable").unwrap();
        let preview = root_for_channel(temporary.path(), "preview").unwrap();
        let settings = json!({"profileId":"example","version":1});
        save(&stable, "example", &settings).unwrap();
        assert_eq!(load(&preview, "example").unwrap(), None);
        assert!(root_for_channel(temporary.path(), "other").is_err());
        for id in ["", "..", "../outside", "a/b", "a\\b"] {
            assert!(load(&stable, id).is_err());
            assert!(save(&stable, id, &json!({"profileId":id,"version":1})).is_err());
        }
        assert!(save(&stable, "mismatch", &settings).is_err());
        assert!(save(
            &stable,
            "example",
            &json!({"profileId":"example","version":2})
        )
        .is_err());
        assert_eq!(load(&stable, "example").unwrap(), Some(settings));
    }

    #[cfg(unix)]
    #[test]
    fn linked_profile_directories_and_configurations_cannot_escape() {
        let temporary = tempfile::tempdir().unwrap();
        let root = root_for_channel(temporary.path(), "stable").unwrap();
        let outside = temporary.path().join("outside");
        std::fs::create_dir_all(root.join("profiles")).unwrap();
        std::fs::create_dir(&outside).unwrap();
        std::os::unix::fs::symlink(&outside, root.join("profiles/linked")).unwrap();
        let settings = json!({"profileId":"linked","version":1});
        assert!(save(&root, "linked", &settings).is_err());
        assert!(load(&root, "linked").is_err());
        assert!(!outside.join("config.json").exists());
        std::fs::create_dir(root.join("profiles/leaf")).unwrap();
        std::fs::write(outside.join("original"), "untouched").unwrap();
        std::os::unix::fs::symlink(
            outside.join("original"),
            root.join("profiles/leaf/config.json"),
        )
        .unwrap();
        assert!(load(&root, "leaf").is_err());
        assert!(save(&root, "leaf", &json!({"profileId":"leaf","version":1})).is_err());
        assert_eq!(
            std::fs::read_to_string(outside.join("original")).unwrap(),
            "untouched"
        );
    }
}
