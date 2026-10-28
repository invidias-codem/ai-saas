package main

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/invidias-codem/ai-saas/go-harness/internal/fsutil"
	"github.com/invidias-codem/ai-saas/go-harness/internal/lifecycle"
	"github.com/invidias-codem/ai-saas/go-harness/internal/telemetry"
)

func shutdownSession(t *testing.T) *SessionContext {
	t.Helper()
	session := &SessionContext{Registry: fsutil.NewRootRegistry(), Telemetry: telemetry.NewManager(), Work: lifecycle.New(context.Background())}
	t.Cleanup(func() {
		session.Work.Stop()
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		if err := session.Work.Wait(ctx); err != nil {
			t.Error(err)
		}
		session.Telemetry.Close()
		session.Registry.Close()
	})
	return session
}

func TestShutdownIsAuthenticatedAndClosesAdmission(t *testing.T) {
	session := shutdownSession(t)
	previous := expectedToken
	expectedToken = "lifecycle-regression-token"
	t.Cleanup(func() { expectedToken = previous; session.Work.Stop() })
	for _, token := range []string{"", "wrong-token"} {
		response := httptest.NewRecorder()
		frame, _ := json.Marshal(map[string]any{"id": "shutdown-test", "jsonrpc": "2.0", "action": "shutdown", "authToken": token, "inputs": map[string]any{}})
		processFrame(response, t.Context(), session, frame)
		var reply JSONRPCResponse
		if err := json.Unmarshal(response.Body.Bytes(), &reply); err != nil || reply.Error == nil {
			t.Fatal("unauthenticated shutdown accepted")
		}
		if session.Work.Context().Err() != nil {
			t.Fatal("unauthenticated request stopped service")
		}
	}
	frame, _ := json.Marshal(map[string]any{"id": "shutdown-test", "jsonrpc": "2.0", "action": "shutdown", "authToken": expectedToken, "inputs": map[string]any{}})
	response := httptest.NewRecorder()
	processFrame(response, t.Context(), session, frame)
	var reply JSONRPCResponse
	_ = json.Unmarshal(response.Body.Bytes(), &reply)
	if reply.Result == nil || !reply.Result.Ok || session.Work.Context().Err() == nil {
		t.Fatal("authenticated shutdown did not stop service")
	}
	status, _ := json.Marshal(map[string]any{"id": "late-status", "action": "status", "authToken": expectedToken})
	response = httptest.NewRecorder()
	processFrame(response, t.Context(), session, status)
	_ = json.Unmarshal(response.Body.Bytes(), &reply)
	if reply.Error == nil || reply.Error.Code != -32001 {
		t.Fatal("new work admitted after stop")
	}
}

func TestShutdownCancelsAndJoinsAnActiveCommand(t *testing.T) {
	session := shutdownSession(t)
	previous := expectedToken
	expectedToken = "lifecycle-regression-token"
	t.Cleanup(func() { expectedToken = previous; session.Work.Stop() })
	dir := t.TempDir()
	if err := session.Registry.UpdateGrants([]fsutil.RootGrant{{Path: dir, UserID: "employee", WorkspaceID: "project", AllowDestructive: true}}); err != nil {
		t.Fatal(err)
	}
	exe, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	command := `"` + exe + `" -test.run=^TestRPCCommandProcessHelper$ -- --rpc-process-helper "` + dir + `"`
	frame, _ := json.Marshal(map[string]any{"id": "active", "action": "execute_command_secure", "authToken": expectedToken, "inputs": map[string]any{"command": command, "path": dir, "user_id": "employee", "workspace_id": "project", "timeout_seconds": 10}})
	completed := make(chan struct{})
	go func() {
		defer close(completed)
		processFrame(httptest.NewRecorder(), context.Background(), session, frame)
	}()
	deadline := time.Now().Add(3 * time.Second)
	for {
		if _, err := os.Stat(filepath.Join(dir, "started")); err == nil {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("command did not start")
		}
		time.Sleep(10 * time.Millisecond)
	}
	session.Work.Stop()
	ctx, cancel := context.WithTimeout(t.Context(), 2*time.Second)
	defer cancel()
	if err := session.Work.Wait(ctx); err != nil {
		t.Fatal("command cleanup did not finish", err)
	}
	<-completed
	time.Sleep(time.Second)
	if _, err := os.Stat(filepath.Join(dir, "escaped")); !os.IsNotExist(err) {
		t.Fatal("command outlived daemon shutdown")
	}
}
