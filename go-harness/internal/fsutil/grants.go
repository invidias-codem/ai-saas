package fsutil

import "time"

// RootGrant represents a user-authorized local directory.
// It is explicitly scoped to a user and optionally a workspace.
type RootGrant struct {
	ID          string    `json:"id"`
	WorkspaceID string    `json:"workspace_id,omitempty"`
	UserID      string    `json:"user_id"`
	Path        string    `json:"path"`
	Label       string    `json:"label"`
	ReadOnly         bool      `json:"read_only"`
	AllowDestructive bool      `json:"allow_destructive"`
	CreatedAt        time.Time `json:"created_at"`
}
