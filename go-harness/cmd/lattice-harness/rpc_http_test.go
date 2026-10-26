package main

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/invidias-codem/ai-saas/go-harness/internal/fsutil"
	"github.com/invidias-codem/ai-saas/go-harness/internal/telemetry"
)

func TestRPCTransportBoundaries(t *testing.T) {
	session := &SessionContext{Registry: fsutil.NewRootRegistry(), Telemetry: telemetry.NewManager()}
	handler := newRPCHandler(session, "tauri://localhost")
	for _, tc := range []struct {
		name, method, origin, body string
		want                       int
	}{
		{"untrusted origin", "POST", "https://untrusted.example", `{}`, 403},
		{"untrusted preflight", "OPTIONS", "https://untrusted.example", "", 403},
		{"allowed preflight", "OPTIONS", "tauri://localhost", "", 204},
		{"wrong method", "GET", "", "", 405},
		{"oversized body", "POST", "", strings.Repeat("x", maxRPCRequestBytes+1), 413},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := httptest.NewRequest(tc.method, "/rpc", strings.NewReader(tc.body))
			r.Header.Set("Origin", tc.origin)
			w := httptest.NewRecorder()
			handler.ServeHTTP(w, r)
			if w.Code != tc.want {
				t.Fatalf("got %d, want %d", w.Code, tc.want)
			}
			if tc.want == 403 && w.Header().Get("Access-Control-Allow-Origin") != "" {
				t.Fatal("untrusted origin received CORS access")
			}
		})
	}
}

func TestRPCCommandProcessHelper(t *testing.T) {
	for i, arg := range os.Args {
		if arg == "--rpc-process-helper" && i+1 < len(os.Args) {
			dir := os.Args[i+1]
			if err := os.WriteFile(filepath.Join(dir, "started"), []byte("ready"), 0600); err != nil {
				os.Exit(9)
			}
			time.Sleep(800 * time.Millisecond)
			_ = os.WriteFile(filepath.Join(dir, "escaped"), []byte("running"), 0600)
			os.Exit(0)
		}
	}
}

func TestRPCCommandHTTPDisconnectCancelsProcess(t *testing.T) {
	dir := t.TempDir()
	previous := expectedToken
	expectedToken = "transport-test-token"
	t.Cleanup(func() { expectedToken = previous; cleanupHarnesses() })
	session := &SessionContext{Registry: fsutil.NewRootRegistry(), Telemetry: telemetry.NewManager()}
	session.Registry.UpdateGrants([]fsutil.RootGrant{{Path: dir, UserID: "user", WorkspaceID: "project", AllowDestructive: true}})
	server := httptest.NewServer(newRPCHandler(session, "tauri://localhost"))
	defer server.Close()
	exe, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	command := `"` + exe + `" -test.run=^TestRPCCommandProcessHelper$ -- --rpc-process-helper "` + dir + `"`
	payload, _ := json.Marshal(map[string]any{"jsonrpc": "2.0", "id": "cancel-test", "authToken": expectedToken, "workspaceRoot": dir, "action": "execute_command_secure", "inputs": map[string]any{"command": command, "path": dir, "workspace_id": "project", "user_id": "user", "timeout_seconds": 5}})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	r, _ := http.NewRequestWithContext(ctx, "POST", server.URL, strings.NewReader(string(payload)))
	done := make(chan error, 1)
	go func() {
		response, err := http.DefaultClient.Do(r)
		if response != nil {
			_, _ = io.Copy(io.Discard, response.Body)
			response.Body.Close()
		}
		done <- err
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
	cancel()
	select {
	case err := <-done:
		if err == nil {
			t.Fatal("request unexpectedly completed before cancellation")
		}
	case <-time.After(2 * time.Second):
		t.Fatal("request ignored cancellation")
	}
	time.Sleep(time.Second)
	if _, err := os.Stat(filepath.Join(dir, "escaped")); !os.IsNotExist(err) {
		t.Fatal("command survived HTTP disconnect")
	}
}
