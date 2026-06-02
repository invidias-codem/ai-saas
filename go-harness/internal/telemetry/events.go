package telemetry

import (
	"time"
)

// TelemetryEvent defines the structure of a local capability operation event.
type TelemetryEvent struct {
	ID            string `json:"id,omitempty"`
	WorkspaceID   string `json:"workspace_id,omitempty"`
	UserID        string `json:"user_id"`
	EventType     string `json:"event_type"`
	PathAccessed  string `json:"path_accessed,omitempty"`
	Success       bool   `json:"success"`
	ErrorMessage  string `json:"error_message,omitempty"`
	DurationMs    int    `json:"duration_ms,omitempty"`
	OperationType string `json:"operation_type,omitempty"`
	Timestamp     string `json:"timestamp"`
}

// Event Types
const (
	EventRootAccessGranted       = "root_access_granted"
	EventRootAccessDenied        = "root_access_denied"
	EventDirectoryList           = "directory_list"
	EventFileRead                = "file_read"
	EventStatPath                = "stat_path"
	EventPathViolation           = "path_violation_blocked"
	EventFileWrite               = "file_write"
	EventFileCreate              = "file_create"
	EventDirectoryCreate         = "directory_create"
	EventPathMove                = "path_move"
	EventPathDelete              = "path_delete"
	EventMutationDenied          = "mutation_denied"
	EventDestructiveActionDenied = "destructive_action_denied"
	
	// Phase 3A Intelligence Events
	EventDocumentDiscoverySuccess = "document_discovery_success"
	EventDocumentDiscoveryFailure = "document_discovery_failure"
	EventDocumentExtractSuccess   = "document_extract_success"
	EventDocumentExtractFailure   = "document_extract_failure"
	EventRepoSummarySuccess       = "repo_summary_success"
	EventRepoSummaryFailure       = "repo_summary_failure"
	EventUnsupportedLocalInput    = "unsupported_local_input"
	
	// Phase 4.5 Ingestion Events
	EventIngestionStarted  = "ingestion_started"
	EventIngestionProgress = "ingestion_progress"
	EventIngestionComplete = "ingestion_complete"
	EventIngestionFailure  = "ingestion_failure"

	// Phase 5 Execution Events
	EventCommandExecuted   = "command_executed"
	EventCommandTimeout    = "command_timeout"
	EventCommandDenied     = "command_denied"
)

// Helper to construct common event fields
func NewEvent(userID, workspaceID, eventType, pathAccessed, opType string, duration time.Duration, err error) TelemetryEvent {
	success := err == nil
	var errMsg string
	if err != nil {
		errMsg = err.Error()
	}

	return TelemetryEvent{
		UserID:        userID,
		WorkspaceID:   workspaceID,
		EventType:     eventType,
		PathAccessed:  pathAccessed,
		Success:       success,
		ErrorMessage:  errMsg,
		DurationMs:    int(duration.Milliseconds()),
		OperationType: opType,
		Timestamp:     time.Now().UTC().Format(time.RFC3339),
	}
}
