//! Durable append-only session journal for a single profile.
//! Every client action is recorded exactly once with a monotonic sequence,
//! so a restart rebuilds session state by replaying the journal without
//! re-applying any file mutations from a crashed turn (fresh permissions
//! are required before new native writes).
//!
//! # ponytail: JSONL journal guarded by a single Mutex with an O(n) load;
//! upgrade to rusqlite (bundled SQLite) when concurrent readers or large
//! journals make the linear scan costly.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs::{self, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::Path;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

fn now_ts() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs().to_string())
        .unwrap_or_default()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SessionStatus {
    Open,
    Closed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub id: String,
    pub client_id: String,
    pub status: SessionStatus,
    pub created_at: String,
    pub closed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskEvent {
    pub seq: u64,
    pub session_id: String,
    pub kind: String,
    pub payload: serde_json::Value,
    pub ts: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
enum JournalEntry {
    Session(Session),
    Event(TaskEvent),
}

struct StoreInner {
    sessions: BTreeMap<String, Session>,
    events: Vec<TaskEvent>,
    next_seq: u64,
}

pub struct SessionStore {
    path: std::path::PathBuf,
    inner: Mutex<StoreInner>,
}

impl SessionStore {
    pub fn open(profile_dir: &Path) -> std::io::Result<Self> {
        fs::create_dir_all(profile_dir)?;
        let path = profile_dir.join("sessions.jsonl");
        let mut inner = StoreInner {
            sessions: BTreeMap::new(),
            events: Vec::new(),
            next_seq: 0,
        };
        if path.exists() {
            let file = fs::File::open(&path)?;
            let reader = BufReader::new(file);
            for line in reader.lines() {
                let line = line?;
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }
                let entry: JournalEntry = match serde_json::from_str(trimmed) {
                    Ok(e) => e,
                    // A torn trailing line is never replayed; skip it.
                    Err(_) => continue,
                };
                match entry {
                    JournalEntry::Session(s) => {
                        inner.sessions.insert(s.id.clone(), s);
                    }
                    JournalEntry::Event(e) => {
                        if e.seq >= inner.next_seq {
                            inner.next_seq = e.seq + 1;
                        }
                        inner.events.push(e);
                    }
                }
            }
        }
        Ok(Self { path, inner: Mutex::new(inner) })
    }

    pub fn create_session(&self, id: String, client_id: String) -> Result<Session, String> {
        let mut inner = self.inner.lock().map_err(|_| "store lock poisoned".to_string())?;
        if inner.sessions.contains_key(&id) {
            return Err(format!("session {id} already exists"));
        }
        let session = Session {
            id: id.clone(),
            client_id,
            status: SessionStatus::Open,
            created_at: now_ts(),
            closed_at: None,
        };
        // Persist first so the file is the source of truth; memory rebuilds from it.
        self.append_entry(&JournalEntry::Session(session.clone())).map_err(|e| e.to_string())?;
        inner.sessions.insert(id, session.clone());
        Ok(session)
    }

    pub fn list_sessions(&self) -> Vec<Session> {
        let inner = self.inner.lock().unwrap();
        inner.sessions.values().cloned().collect()
    }

    pub fn get_session(&self, id: &str) -> Option<Session> {
        let inner = self.inner.lock().unwrap();
        inner.sessions.get(id).cloned()
    }

    pub fn close_session(&self, id: &str, status: SessionStatus) -> Result<(), String> {
        let mut inner = self.inner.lock().map_err(|_| "store lock poisoned".to_string())?;
        let session = inner.sessions.get_mut(id).ok_or("session not found")?;
        if session.status != SessionStatus::Open {
            return Err("session is not open".to_string());
        }
        session.status = status;
        session.closed_at = Some(now_ts());
        self.append_entry(&JournalEntry::Session(session.clone())).map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Append an event to `session_id`, rejecting callers that do not own the
    /// session. Each event gets a monotonic sequence and is never replayed as
    /// a file mutation — it is an observation only.
    pub fn append_event(
        &self,
        session_id: &str,
        client_id: &str,
        kind: String,
        payload: serde_json::Value,
    ) -> Result<TaskEvent, String> {
        let mut inner = self.inner.lock().map_err(|_| "store lock poisoned".to_string())?;
        let owned = inner
            .sessions
            .get(session_id)
            .map(|s| s.client_id == client_id && s.status == SessionStatus::Open)
            .unwrap_or(false);
        if !owned {
            return Err("session not found, closed, or not owned by this client".to_string());
        }
        let seq = inner.next_seq;
        inner.next_seq += 1;
        let event = TaskEvent {
            seq,
            session_id: session_id.to_string(),
            kind,
            payload,
            ts: now_ts(),
        };
        self.append_entry(&JournalEntry::Event(event.clone())).map_err(|e| e.to_string())?;
        inner.events.push(event.clone());
        Ok(event)
    }

    pub fn events_for_session(&self, session_id: &str) -> Vec<TaskEvent> {
        let inner = self.inner.lock().unwrap();
        inner.events.iter().filter(|e| e.session_id == session_id).cloned().collect()
    }

    fn append_entry(&self, entry: &JournalEntry) -> std::io::Result<()> {
        let mut file = OpenOptions::new().create(true).append(true).open(&self.path)?;
        let line = serde_json::to_string(entry).map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))?;
        writeln!(file, "{line}")?;
        // Durable acknowledgment: the write is on disk before we return Ok,
        // so a crash after this point never loses a journaled session or event.
        file.sync_all()?;
        Ok(())
    }
}
