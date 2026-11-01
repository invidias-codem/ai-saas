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
use serde_json::Value;
use std::collections::BTreeMap;
use std::fs::{self, OpenOptions};
use std::io::{BufRead, BufReader, Seek, Write};
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
    /// Idempotency record: client-scoped request key -> cached result.
    /// Survives restart so a retried request never re-executes.
    Idempotency { client_id: String, key: String, result: Value },
}

struct StoreInner {
    sessions: BTreeMap<String, Session>,
    events: Vec<TaskEvent>,
    idempotency: BTreeMap<String, Value>,
    next_seq: u64,
    next_session: u64,
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
            idempotency: BTreeMap::new(),
            next_seq: 0,
            next_session: 0,
        };
        if path.exists() {
            let file = fs::File::open(&path)?;
            let mut reader = BufReader::new(file);
            let mut torn_at: Option<u64> = None;

            loop {
                let pos = reader.stream_position()?;
                let mut line = String::new();
                let n = reader.read_line(&mut line).map_err(|e| {
                    std::io::Error::new(std::io::ErrorKind::Other, e.to_string())
                })?;
                if n == 0 {
                    break;
                }
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }
                match serde_json::from_str::<JournalEntry>(trimmed) {
                    Ok(entry) => match entry {
                        JournalEntry::Session(s) => {
                            inner.sessions.insert(s.id.clone(), s.clone());
                            if let Some(num) = s.id.strip_prefix("session-") {
                                if let Ok(n) = u64::from_str_radix(num, 16) {
                                    if n >= inner.next_session {
                                        inner.next_session = n + 1;
                                    }
                                }
                            }
                        }
                        JournalEntry::Event(e) => {
                            if e.seq >= inner.next_seq {
                                inner.next_seq = e.seq + 1;
                            }
                            inner.events.push(e);
                        }
                        JournalEntry::Idempotency {
                            client_id,
                            key,
                            result,
                        } => {
                            inner
                                .idempotency
                                .insert(format!("{}:{}", client_id, key), result);
                        }
                    },
                    Err(_) => {
                        // Torn line: stop processing and truncate everything
                        // from this point onward so future appends don't sit
                        // after corrupt data.
                        torn_at = Some(pos);
                        break;
                    }
                }
            }

            if let Some(pos) = torn_at {
                drop(reader);
                let file = OpenOptions::new().write(true).open(&path)?;
                file.set_len(pos)?;
            }
        }
        Ok(Self {
            path,
            inner: Mutex::new(inner),
        })
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
        self.append_entry(&JournalEntry::Session(session.clone()))
            .map_err(|e| e.to_string())?;
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
        self.append_entry(&JournalEntry::Session(session.clone()))
            .map_err(|e| e.to_string())?;
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
        self.append_entry(&JournalEntry::Event(event.clone()))
            .map_err(|e| e.to_string())?;
        inner.events.push(event.clone());
        Ok(event)
    }

    pub fn events_for_session(&self, session_id: &str) -> Vec<TaskEvent> {
        let inner = self.inner.lock().unwrap();
        inner
            .events
            .iter()
            .filter(|e| e.session_id == session_id)
            .cloned()
            .collect()
    }

    /// Return a cached idempotency result for `client_id:key`, if one exists.
    pub fn get_idempotency(&self, client_id: &str, key: &str) -> Option<Value> {
        let inner = self.inner.lock().unwrap();
        inner
            .idempotency
            .get(&format!("{}:{}", client_id, key))
            .cloned()
    }

    /// Record an idempotency result for `client_id:key`, persisted to the
    /// journal so it survives restart.
    pub fn record_idempotency(
        &self,
        client_id: &str,
        key: &str,
        result: &Value,
    ) -> std::io::Result<()> {
        // Update in-memory first so get_idempotency sees it immediately.
        {
            let mut inner = self.inner.lock().map_err(|_| {
                std::io::Error::new(std::io::ErrorKind::Other, "store lock poisoned")
            })?;
            inner
                .idempotency
                .insert(format!("{}:{}", client_id, key), result.clone());
        }
        // Then persist to the journal.
        let entry = JournalEntry::Idempotency {
            client_id: client_id.to_string(),
            key: key.to_string(),
            result: result.clone(),
        };
        self.append_entry(&entry)
    }

    /// Return the next session ID suffix, seeded from existing sessions on
    /// replay so IDs never collide after restart.
    pub fn next_session_id(&self) -> u64 {
        let inner = self.inner.lock().unwrap();
        inner.next_session
    }

    fn append_entry(&self, entry: &JournalEntry) -> std::io::Result<()> {
        let mut file = OpenOptions::new().create(true).append(true).open(&self.path)?;
        let line = serde_json::to_string(entry).map_err(|e| {
            std::io::Error::new(std::io::ErrorKind::Other, e.to_string())
        })?;
        writeln!(file, "{line}")?;
        // Durable acknowledgment: the write is on disk before we return Ok,
        // so a crash after this point never loses a journaled session or event.
        file.sync_all()?;
        Ok(())
    }
}
