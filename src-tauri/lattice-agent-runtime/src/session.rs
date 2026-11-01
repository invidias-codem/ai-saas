//! Session manager for durable sessions and task journal.
//!
//! Persists conversations and task events in profile-local SQLite.
//! Handles session reconciliation and crash recovery.

use crate::{ProviderKind, ProviderConnectionStatus, RuntimeError};
use sqlx::{sqlite::SqlitePoolOptions, Pool, Row, Sqlite};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, SystemTime};
use thiserror::Error;
use tokio::sync::RwLock;
use tracing::{debug, info, warn};
use uuid::Uuid;

/// Session manager errors.
#[derive(Debug, Error)]
pub enum SessionManagerError {
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),
    #[error("Session not found: {0}")]
    NotFound(String),
    #[error("Invalid session state: {0}")]
    InvalidState(String),
    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Migration error: {0}")]
    Migration(String),
}

pub type SessionResult<T> = std::result::Result<T, SessionManagerError>;

/// Session configuration.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SessionConfig {
    pub db_path: PathBuf,
    pub max_session_age: Duration,
    pub auto_reconcile: bool,
}

/// Session record in the database.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SessionRecord {
    pub session_id: String,
    pub profile_id: String,
    pub title: Option<String>,
    pub state: SessionState,
    pub provider_connection_id: Option<String>,
    pub model_id: Option<String>,
    pub system_prompt: Option<String>,
    pub message_count: u32,
    pub created_at: SystemTime,
    pub updated_at: SystemTime,
    pub metadata: serde_json::Value,
}

/// Session state.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum SessionState {
    Created,
    Running,
    WaitingForInput,
    Completed,
    Failed,
    Cancelled,
}

impl SessionState {
    fn as_str(&self) -> &'static str {
        match self {
            Self::Created => "created",
            Self::Running => "running",
            Self::WaitingForInput => "waiting_for_input",
            Self::Completed => "completed",
            Self::Failed => "failed",
            Self::Cancelled => "cancelled",
        }
    }

    fn from_str(s: &str) -> Self {
        match s {
            "created" => Self::Created,
            "running" => Self::Running,
            "waiting_for_input" => Self::WaitingForInput,
            "completed" => Self::Completed,
            "failed" => Self::Failed,
            "cancelled" => Self::Cancelled,
            _ => Self::Created,
        }
    }
}

/// Message record in the database.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct MessageRecord {
    pub message_id: String,
    pub session_id: String,
    pub role: MessageRole,
    pub content: String,
    pub attachments: serde_json::Value,
    pub provider_kind: Option<ProviderKind>,
    pub model_id: Option<String>,
    pub tokens_used: Option<u32>,
    pub latency_ms: Option<u64>,
    pub created_at: SystemTime,
    pub metadata: serde_json::Value,
}

/// Message role.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum MessageRole {
    System,
    User,
    Assistant,
    Tool,
}

/// Task/event journal record.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TaskRecord {
    pub task_id: String,
    pub session_id: String,
    pub task_type: String,
    pub state: TaskState,
    pub input: serde_json::Value,
    pub output: Option<serde_json::Value>,
    pub error: Option<String>,
    pub started_at: SystemTime,
    pub completed_at: Option<SystemTime>,
    pub metadata: serde_json::Value,
}

/// Task state.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum TaskState {
    Pending,
    Running,
    Completed,
    Failed,
    Cancelled,
}

/// Session manager with SQLite persistence.
pub struct SessionManager {
    pool: Pool<Sqlite>,
    config: SessionConfig,
    active_sessions: RwLock<std::collections::HashSet<String>>,
}

impl SessionManager {
    /// Create a new session manager and initialize the database.
    pub async fn new(db_path: PathBuf, config: SessionConfig) -> SessionResult<Self> {
        // Ensure parent directory exists
        if let Some(parent) = db_path.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }

        // Create connection pool
        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect(&format!("sqlite://{}?mode=rwc", db_path.display()))
            .await?;

        let manager = Self {
            pool,
            config,
            active_sessions: RwLock::new(std::collections::HashSet::new()),
        };

        // Run migrations
        manager.migrate().await?;

        // Reconcile incomplete sessions if configured
        if manager.config.auto_reconcile {
            manager.reconcile_incomplete_sessions().await?;
        }

        Ok(manager)
    }

    /// Run database migrations.
    async fn migrate(&self) -> SessionResult<()> {
        // Create sessions table
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS sessions (
                session_id TEXT PRIMARY KEY,
                profile_id TEXT NOT NULL,
                title TEXT,
                state TEXT NOT NULL DEFAULT 'created',
                provider_connection_id TEXT,
                model_id TEXT,
                system_prompt TEXT,
                message_count INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                metadata TEXT NOT NULL DEFAULT '{}'
            )
            "#,
        )
        .execute(&self.pool)
        .await?;

        // Create messages table
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS messages (
                message_id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                attachments TEXT NOT NULL DEFAULT '[]',
                provider_kind TEXT,
                model_id TEXT,
                tokens_used INTEGER,
                latency_ms INTEGER,
                created_at TEXT NOT NULL,
                metadata TEXT NOT NULL DEFAULT '{}'
            )
            "#,
        )
        .execute(&self.pool)
        .await?;

        // Create tasks table
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS tasks (
                task_id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
                task_type TEXT NOT NULL,
                state TEXT NOT NULL DEFAULT 'pending',
                input TEXT NOT NULL,
                output TEXT,
                error TEXT,
                started_at TEXT NOT NULL,
                completed_at TEXT,
                metadata TEXT NOT NULL DEFAULT '{}'
            )
            "#,
        )
        .execute(&self.pool)
        .await?;

        // Create indexes
        sqlx::query("CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id)")
            .execute(&self.pool)
            .await?;
        sqlx::query("CREATE INDEX IF NOT EXISTS idx_tasks_session ON tasks(session_id)")
            .execute(&self.pool)
            .await?;
        sqlx::query("CREATE INDEX IF NOT EXISTS idx_sessions_profile ON sessions(profile_id)")
            .execute(&self.pool)
            .await?;
        sqlx::query("CREATE INDEX IF NOT EXISTS idx_sessions_state ON sessions(state)")
            .execute(&self.pool)
            .await?;

        // Migration version table
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS schema_version (
                version INTEGER PRIMARY KEY,
                applied_at TEXT NOT NULL
            )
            "#,
        )
        .execute(&self.pool)
            .await?;

        Ok(())
    }

    /// Reconcile incomplete sessions on startup.
    async fn reconcile_incomplete_sessions(&self) -> SessionResult<()> {
        // Find sessions that were in running/waiting state
        let incomplete = sqlx::query(
            r#"
            SELECT session_id FROM sessions
            WHERE state IN ('running', 'waiting_for_input')
            "#,
        )
        .fetch_all(&self.pool)
        .await?;

        for row in incomplete {
            let session_id: String = row.get("session_id");
            info!("Reconciling incomplete session: {}", session_id);

            // Check if there are incomplete tasks
            let incomplete_tasks = sqlx::query(
                r#"
                SELECT task_id FROM tasks
                WHERE session_id = ? AND state IN ('pending', 'running')
                "#,
            )
            .bind(&session_id)
            .fetch_all(&self.pool)
            .await?;

            if !incomplete_tasks.is_empty() {
                // Mark tasks as cancelled (don't replay)
                for task_row in incomplete_tasks {
                    let task_id: String = task_row.get("task_id");
                    sqlx::query(
                        r#"
                        UPDATE tasks SET state = 'cancelled', completed_at = ?
                        WHERE task_id = ?
                        "#,
                    )
                    .bind(chrono::Utc::now().to_rfc3339())
                    .bind(&task_id)
                    .execute(&self.pool)
                    .await?;
                    warn!("Cancelled incomplete task: {}", task_id);
                }

                // Mark session as failed (requires fresh permissions)
                sqlx::query(
                    r#"
                    UPDATE sessions SET state = 'failed', updated_at = ?
                    WHERE session_id = ?
                    "#,
                )
                .bind(chrono::Utc::now().to_rfc3339())
                .bind(&session_id)
                .execute(&self.pool)
                .await?;

                info!("Marked session {} as failed due to incomplete tasks", session_id);
            } else {
                // No incomplete tasks, mark as waiting for input
                sqlx::query(
                    r#"
                    UPDATE sessions SET state = 'waiting_for_input', updated_at = ?
                    WHERE session_id = ?
                    "#,
                )
                .bind(chrono::Utc::now().to_rfc3339())
                .bind(&session_id)
                .execute(&self.pool)
                .await?;

                info!("Marked session {} as waiting_for_input", session_id);
            }
        }

        Ok(())
    }

    /// Create a new session.
    pub async fn create_session(
        &self,
        profile_id: String,
        title: Option<String>,
        provider_connection_id: Option<String>,
        model_id: Option<String>,
        system_prompt: Option<String>,
    ) -> SessionResult<SessionRecord> {
        let session_id = Uuid::new_v4().to_string();
        let now = SystemTime::now();

        let record = SessionRecord {
            session_id: session_id.clone(),
            profile_id: profile_id.clone(),
            title,
            state: SessionState::Created,
            provider_connection_id,
            model_id,
            system_prompt,
            message_count: 0,
            created_at: now,
            updated_at: now,
            metadata: serde_json::json!({}),
        };

        sqlx::query(
            r#"
            INSERT INTO sessions (session_id, profile_id, title, state, provider_connection_id, model_id, system_prompt, message_count, created_at, updated_at, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&record.session_id)
        .bind(&record.profile_id)
        .bind(&record.title)
        .bind(record.state.as_str())
        .bind(&record.provider_connection_id)
        .bind(&record.model_id)
        .bind(&record.system_prompt)
        .bind(record.message_count as i64)
        .bind(chrono::DateTime::<chrono::Utc>::from(record.created_at).to_rfc3339())
        .bind(chrono::DateTime::<chrono::Utc>::from(record.updated_at).to_rfc3339())
        .bind(serde_json::to_string(&record.metadata)?)
        .execute(&self.pool)
        .await?;

        self.active_sessions.write().await.insert(session_id);

        Ok(record)
    }

    /// Get a session by ID.
    pub async fn get_session(&self, session_id: &str) -> SessionResult<SessionRecord> {
        let row = sqlx::query(
            r#"
            SELECT session_id, profile_id, title, state, provider_connection_id, model_id, system_prompt, message_count, created_at, updated_at, metadata
            FROM sessions WHERE session_id = ?
            "#,
        )
        .bind(session_id)
        .fetch_optional(&self.pool)
        .await?;

        match row {
            Some(row) => Ok(self.row_to_session(row)),
            None => Err(SessionManagerError::NotFound(session_id.to_string())),
        }
    }

    /// Update session state.
    pub async fn update_session_state(
        &self,
        session_id: &str,
        state: SessionState,
    ) -> SessionResult<()> {
        let now = SystemTime::now();
        sqlx::query(
            r#"
            UPDATE sessions SET state = ?, updated_at = ? WHERE session_id = ?
            "#,
        )
        .bind(state.as_str())
        .bind(chrono::DateTime::<chrono::Utc>::from(now).to_rfc3339())
        .bind(session_id)
        .execute(&self.pool)
        .await?;

        if state == SessionState::Completed || state == SessionState::Failed || state == SessionState::Cancelled {
            self.active_sessions.write().await.remove(session_id);
        }

        Ok(())
    }

    /// Update session metadata.
    pub async fn update_session_metadata(
        &self,
        session_id: &str,
        metadata: serde_json::Value,
    ) -> SessionResult<()> {
        let now = SystemTime::now();
        sqlx::query(
            r#"
            UPDATE sessions SET metadata = ?, updated_at = ? WHERE session_id = ?
            "#,
        )
        .bind(serde_json::to_string(&metadata)?)
        .bind(chrono::DateTime::<chrono::Utc>::from(now).to_rfc3339())
        .bind(session_id)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Add a message to a session.
    pub async fn add_message(
        &self,
        session_id: &str,
        role: MessageRole,
        content: String,
        attachments: Vec<serde_json::Value>,
        provider_kind: Option<ProviderKind>,
        model_id: Option<String>,
        tokens_used: Option<u32>,
        latency_ms: Option<u64>,
    ) -> SessionResult<MessageRecord> {
        let message_id = Uuid::new_v4().to_string();
        let now = SystemTime::now();

        let record = MessageRecord {
            message_id: message_id.clone(),
            session_id: session_id.to_string(),
            role,
            content,
            attachments: serde_json::Value::Array(attachments),
            provider_kind,
            model_id,
            tokens_used,
            latency_ms,
            created_at: now,
            metadata: serde_json::json!({}),
        };

        sqlx::query(
            r#"
            INSERT INTO messages (message_id, session_id, role, content, attachments, provider_kind, model_id, tokens_used, latency_ms, created_at, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&record.message_id)
        .bind(&record.session_id)
        .bind(match record.role {
            MessageRole::System => "system",
            MessageRole::User => "user",
            MessageRole::Assistant => "assistant",
            MessageRole::Tool => "tool",
        })
        .bind(&record.content)
        .bind(serde_json::to_string(&record.attachments)?)
        .bind(record.provider_kind.map(|k| k.as_str()))
        .bind(&record.model_id)
        .bind(record.tokens_used.map(|v| v as i64))
        .bind(record.latency_ms.map(|v| v as i64))
        .bind(chrono::DateTime::<chrono::Utc>::from(record.created_at).to_rfc3339())
        .bind(serde_json::to_string(&record.metadata)?)
        .execute(&self.pool)
        .await?;

        // Update message count
        sqlx::query(
            r#"
            UPDATE sessions SET message_count = message_count + 1, updated_at = ? WHERE session_id = ?
            "#,
        )
        .bind(chrono::DateTime::<chrono::Utc>::from(now).to_rfc3339())
        .bind(session_id)
        .execute(&self.pool)
        .await?;

        Ok(record)
    }

    /// Get messages for a session.
    pub async fn get_messages(&self, session_id: &str, limit: Option<usize>) -> SessionResult<Vec<MessageRecord>> {
        let limit = limit.unwrap_or(100);
        let rows = sqlx::query(
            r#"
            SELECT message_id, session_id, role, content, attachments, provider_kind, model_id, tokens_used, latency_ms, created_at, metadata
            FROM messages WHERE session_id = ? ORDER BY created_at ASC LIMIT ?
            "#,
        )
        .bind(session_id)
        .bind(limit as i64)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.into_iter().map(|row| self.row_to_message(row)).collect())
    }

    /// Create a task record.
    pub async fn create_task(
        &self,
        session_id: &str,
        task_type: String,
        input: serde_json::Value,
    ) -> SessionResult<TaskRecord> {
        let task_id = Uuid::new_v4().to_string();
        let now = SystemTime::now();

        let record = TaskRecord {
            task_id: task_id.clone(),
            session_id: session_id.to_string(),
            task_type,
            state: TaskState::Pending,
            input,
            output: None,
            error: None,
            started_at: now,
            completed_at: None,
            metadata: serde_json::json!({}),
        };

        sqlx::query(
            r#"
            INSERT INTO tasks (task_id, session_id, task_type, state, input, output, error, started_at, completed_at, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&record.task_id)
        .bind(&record.session_id)
        .bind(&record.task_type)
        .bind("pending")
        .bind(serde_json::to_string(&record.input)?)
        .bind(None::<String>)
        .bind(None::<String>)
        .bind(chrono::DateTime::<chrono::Utc>::from(record.started_at).to_rfc3339())
        .bind(None::<String>)
        .bind(serde_json::to_string(&record.metadata)?)
        .execute(&self.pool)
        .await?;

        Ok(record)
    }

    /// Update task state.
    pub async fn update_task(
        &self,
        task_id: &str,
        state: TaskState,
        output: Option<serde_json::Value>,
        error: Option<String>,
    ) -> SessionResult<()> {
        let now = SystemTime::now();
        let completed_at = matches!(state, TaskState::Completed | TaskState::Failed | TaskState::Cancelled)
            .then(|| chrono::DateTime::<chrono::Utc>::from(now).to_rfc3339());

        sqlx::query(
            r#"
            UPDATE tasks SET state = ?, output = ?, error = ?, completed_at = ? WHERE task_id = ?
            "#,
        )
        .bind(match state {
            TaskState::Pending => "pending",
            TaskState::Running => "running",
            TaskState::Completed => "completed",
            TaskState::Failed => "failed",
            TaskState::Cancelled => "cancelled",
        })
        .bind(output.map(serde_json::to_string).transpose()?)
        .bind(error)
        .bind(completed_at)
        .bind(task_id)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Get tasks for a session.
    pub async fn get_tasks(&self, session_id: &str) -> SessionResult<Vec<TaskRecord>> {
        let rows = sqlx::query(
            r#"
            SELECT task_id, session_id, task_type, state, input, output, error, started_at, completed_at, metadata
            FROM tasks WHERE session_id = ? ORDER BY started_at ASC
            "#,
        )
        .bind(session_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.into_iter().map(|row| self.row_to_task(row)).collect())
    }

    /// List sessions for a profile.
    pub async fn list_sessions(
        &self,
        profile_id: &str,
        limit: Option<usize>,
        offset: Option<usize>,
    ) -> SessionResult<Vec<SessionRecord>> {
        let limit = limit.unwrap_or(50);
        let offset = offset.unwrap_or(0);

        let rows = sqlx::query(
            r#"
            SELECT session_id, profile_id, title, state, provider_connection_id, model_id, system_prompt, message_count, created_at, updated_at, metadata
            FROM sessions WHERE profile_id = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?
            "#,
        )
        .bind(profile_id)
        .bind(limit as i64)
        .bind(offset as i64)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.into_iter().map(|row| self.row_to_session(row)).collect())
    }

    /// Get active session count.
    pub async fn active_session_count(&self) -> usize {
        self.active_sessions.read().await.len()
    }

    /// Mark session as active.
    pub async fn mark_active(&self, session_id: &str) {
        self.active_sessions.write().await.insert(session_id.to_string());
    }

    /// Mark session as inactive.
    pub async fn mark_inactive(&self, session_id: &str) {
        self.active_sessions.write().await.remove(session_id);
    }

    /// Delete a session (and cascade to messages/tasks).
    pub async fn delete_session(&self, session_id: &str) -> SessionResult<()> {
        sqlx::query("DELETE FROM sessions WHERE session_id = ?")
            .bind(session_id)
            .execute(&self.pool)
            .await?;
        self.active_sessions.write().await.remove(session_id);
        Ok(())
    }

    /// Convert row to session record.
    fn row_to_session(&self, row: sqlx::sqlite::SqliteRow) -> SessionRecord {
        SessionRecord {
            session_id: row.get("session_id"),
            profile_id: row.get("profile_id"),
            title: row.get("title"),
            state: SessionState::from_str(row.get::<String, _>("state").as_str()),
            provider_connection_id: row.get("provider_connection_id"),
            model_id: row.get("model_id"),
            system_prompt: row.get("system_prompt"),
            message_count: row.get::<i64, _>("message_count") as u32,
            created_at: parse_datetime(row.get("created_at")),
            updated_at: parse_datetime(row.get("updated_at")),
            metadata: serde_json::from_str(row.get("metadata")).unwrap_or_default(),
        }
    }

    /// Convert row to message record.
    fn row_to_message(&self, row: sqlx::sqlite::SqliteRow) -> MessageRecord {
        MessageRecord {
            message_id: row.get("message_id"),
            session_id: row.get("session_id"),
            role: match row.get::<String, _>("role").as_str() {
                "system" => MessageRole::System,
                "user" => MessageRole::User,
                "assistant" => MessageRole::Assistant,
                "tool" => MessageRole::Tool,
                _ => MessageRole::User,
            },
            content: row.get("content"),
            attachments: serde_json::from_str(row.get("attachments")).unwrap_or_default(),
            provider_kind: row.get::<Option<String>, _>("provider_kind").map(|s| ProviderKind::from_str(&s)),
            model_id: row.get("model_id"),
            tokens_used: row.get::<Option<i64>, _>("tokens_used").map(|v| v as u32),
            latency_ms: row.get::<Option<i64>, _>("latency_ms").map(|v| v as u64),
            created_at: parse_datetime(row.get("created_at")),
            metadata: serde_json::from_str(row.get("metadata")).unwrap_or_default(),
        }
    }

    /// Convert row to task record.
    fn row_to_task(&self, row: sqlx::sqlite::SqliteRow) -> TaskRecord {
        TaskRecord {
            task_id: row.get("task_id"),
            session_id: row.get("session_id"),
            task_type: row.get("task_type"),
            state: match row.get::<String, _>("state").as_str() {
                "pending" => TaskState::Pending,
                "running" => TaskState::Running,
                "completed" => TaskState::Completed,
                "failed" => TaskState::Failed,
                "cancelled" => TaskState::Cancelled,
                _ => TaskState::Pending,
            },
            input: serde_json::from_str(row.get("input")).unwrap_or_default(),
            output: row.get::<Option<String>, _>("output").and_then(|s| serde_json::from_str(&s).ok()),
            error: row.get("error"),
            started_at: parse_datetime(row.get("started_at")),
            completed_at: row.get::<Option<String>, _>("completed_at").and_then(|s| parse_datetime_opt(s)),
            metadata: serde_json::from_str(row.get("metadata")).unwrap_or_default(),
        }
    }
}

/// Parse datetime string to SystemTime.
fn parse_datetime(s: String) -> SystemTime {
    chrono::DateTime::parse_from_rfc3339(&s)
        .map(|dt| dt.into())
        .unwrap_or_else(|_| SystemTime::now())
}

/// Parse optional datetime string.
fn parse_datetime_opt(s: String) -> Option<SystemTime> {
    chrono::DateTime::parse_from_rfc3339(&s).ok().map(|dt| dt.into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[tokio::test]
    async fn test_session_manager_create() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("test.sqlite");
        let config = SessionConfig {
            db_path: db_path.clone(),
            max_session_age: Duration::from_secs(86400),
            auto_reconcile: false,
        };

        let manager = SessionManager::new(db_path, config).await.unwrap();

        let session = manager.create_session(
            "test-profile".to_string(),
            Some("Test Session".to_string()),
            None,
            Some("gpt-4".to_string()),
            None,
        ).await.unwrap();

        assert_eq!(session.profile_id, "test-profile");
        assert_eq!(session.state, SessionState::Created);
        assert_eq!(session.model_id, Some("gpt-4".to_string()));

        let retrieved = manager.get_session(&session.session_id).await.unwrap();
        assert_eq!(retrieved.session_id, session.session_id);
    }

    #[tokio::test]
    async fn test_session_messages() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("test.sqlite");
        let config = SessionConfig {
            db_path,
            max_session_age: Duration::from_secs(86400),
            auto_reconcile: false,
        };

        let manager = SessionManager::new(config.db_path.clone(), config).await.unwrap();

        let session = manager.create_session(
            "test-profile".to_string(),
            None,
            None,
            None,
            None,
        ).await.unwrap();

        manager.add_message(
            &session.session_id,
            MessageRole::User,
            "Hello".to_string(),
            vec![],
            None,
            None,
            None,
            None,
        ).await.unwrap();

        manager.add_message(
            &session.session_id,
            MessageRole::Assistant,
            "Hi there!".to_string(),
            vec![],
            None,
            Some("gpt-4".to_string()),
            Some(10),
            Some(500),
        ).await.unwrap();

        let messages = manager.get_messages(&session.session_id, None).await.unwrap();
        assert_eq!(messages.len(), 2);
        assert_eq!(messages[0].role, MessageRole::User);
        assert_eq!(messages[1].role, MessageRole::Assistant);
    }

    #[tokio::test]
    async fn test_task_reconciliation() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("test.sqlite");
        let config = SessionConfig {
            db_path: db_path.clone(),
            max_session_age: Duration::from_secs(86400),
            auto_reconcile: true,
        };

        let manager = SessionManager::new(db_path.clone(), config).await.unwrap();

        // Create a session in running state
        let session = manager.create_session(
            "test-profile".to_string(),
            None,
            None,
            None,
            None,
        ).await.unwrap();

        manager.update_session_state(&session.session_id, SessionState::Running).await.unwrap();

        // Create an incomplete task
        let task = manager.create_task(
            &session.session_id,
            "tool_call".to_string(),
            serde_json::json!({"tool": "read_file"}),
        ).await.unwrap();

        manager.update_task(&task.task_id, TaskState::Running, None, None).await.unwrap();

        // Drop manager and create new one with auto_reconcile
        drop(manager);

        let config2 = SessionConfig {
            db_path: db_path.clone(),
            max_session_age: Duration::from_secs(86400),
            auto_reconcile: true,
        };

        let manager2 = SessionManager::new(db_path, config2).await.unwrap();

        // Session should be marked as failed
        let reconciled = manager2.get_session(&session.session_id).await.unwrap();
        assert_eq!(reconciled.state, SessionState::Failed);

        // Task should be cancelled
        let tasks = manager2.get_tasks(&session.session_id).await.unwrap();
        assert_eq!(tasks[0].state, TaskState::Cancelled);
    }
}