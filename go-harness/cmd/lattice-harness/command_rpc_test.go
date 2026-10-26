package main

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"runtime"
	"strings"
	"testing"

	"github.com/invidias-codem/ai-saas/go-harness/harness"
	"github.com/invidias-codem/ai-saas/go-harness/internal/fsutil"
	"github.com/invidias-codem/ai-saas/go-harness/internal/telemetry"
)

func TestRPCCommandCannotBypassGrantGate(t *testing.T) {
	previous := expectedToken
	expectedToken = "test-launch-token"
	dir := t.TempDir()
	t.Cleanup(func() { expectedToken = previous; cleanupHarnesses() })
	session := &SessionContext{Registry: fsutil.NewRootRegistry(), Telemetry: telemetry.NewManager()}
	for _, action := range []string{"run_command", "execute_command_secure"} {
		payload, _ := json.Marshal(map[string]any{"id": "test", "jsonrpc": "2.0", "workspaceRoot": dir, "authToken": expectedToken, "action": action, "inputs": map[string]any{"command": "echo forbidden", "shell": "cmd", "path": dir, "workspace_id": "ws", "user_id": "user"}})
		w := httptest.NewRecorder()
		processFrame(w, context.Background(), session, payload)
		if !strings.Contains(w.Body.String(), "COMMAND_ACCESS_DENIED") {
			t.Fatalf("%s bypassed grants: %s", action, w.Body.String())
		}
	}
}

func TestRPCCommandAuthenticatedExecution(t *testing.T) {
	previous := expectedToken
	expectedToken = "test-launch-token"
	dir := t.TempDir()
	t.Cleanup(func() { expectedToken = previous; cleanupHarnesses() })
	session := &SessionContext{Registry: fsutil.NewRootRegistry(), Telemetry: telemetry.NewManager()}
	session.Registry.UpdateGrants([]fsutil.RootGrant{{Path: dir, UserID: "employee", WorkspaceID: "project", AllowDestructive: true}})
	shell, script := "sh", "printf 'approved output'; exit 7"
	if runtime.GOOS == "windows" {
		shell, script = "powershell", "Write-Output 'approved output'; exit 7"
	}
	for _, token := range []string{"", "wrong", expectedToken} {
		payload, _ := json.Marshal(map[string]any{"id": "test", "jsonrpc": "2.0", "workspaceRoot": dir, "authToken": token, "action": "execute_command_secure", "inputs": map[string]any{"command": script, "shell": shell, "path": dir, "workspace_id": "project", "user_id": "employee"}})
		w := httptest.NewRecorder()
		processFrame(w, context.Background(), session, payload)
		if token != expectedToken {
			if !strings.Contains(w.Body.String(), "Unauthorized") {
				t.Fatalf("invalid token accepted: %s", w.Body.String())
			}
			continue
		}
		var envelope struct {
			Result harness.ToolExecutionResult `json:"result"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &envelope); err != nil {
			t.Fatal(err)
		}
		if envelope.Result.Ok || !strings.Contains(envelope.Result.Output, "approved output") || !strings.Contains(string(envelope.Result.Data), `"code":7`) {
			t.Fatalf("lost RPC output or exit code: %s", w.Body.String())
		}
	}
}
