package main

import (
	"encoding/json"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/invidias-codem/ai-saas/go-harness/internal/nativeprotocol"
	"github.com/invidias-codem/ai-saas/go-harness/internal/telemetry"
)

func nativeFixture(t *testing.T) (*SessionContext, nativeprotocol.Authority) {
	t.Helper()
	s := shutdownSession(t)
	s.Native = nativeprotocol.NewSession()
	previous := expectedToken
	expectedToken = "native-authority-regression"
	t.Cleanup(func() { expectedToken = previous })
	return s, nativeprotocol.Authority{
		PrincipalID: "local-user-" + strings.Repeat("a", 32),
		WorkspaceID: "local-workspace-" + strings.Repeat("b", 32),
		Generation:  strings.Repeat("c", 32), PolicyRevision: 1, GrantRevision: 0,
	}
}

func nativeCall(t *testing.T, s *SessionContext, action string, inputs any, a *nativeprotocol.Authority) JSONRPCResponse {
	t.Helper()
	frame := map[string]any{"id": "native-test", "jsonrpc": "2.0", "authToken": expectedToken, "action": action, "inputs": inputs}
	if a != nil {
		frame["authority"] = a
	}
	raw, err := json.Marshal(frame)
	if err != nil {
		t.Fatal(err)
	}
	w := httptest.NewRecorder()
	processFrame(w, t.Context(), s, raw)
	var reply JSONRPCResponse
	if err := json.Unmarshal(w.Body.Bytes(), &reply); err != nil {
		t.Fatal(err)
	}
	return reply
}

func bindNative(t *testing.T, s *SessionContext, a nativeprotocol.Authority) {
	t.Helper()
	for _, call := range []struct {
		action string
		inputs any
	}{
		{"native_protocol", map[string]any{}},
		{"bind_native_session", map[string]any{"protocol_version": 1, "authority": a}},
	} {
		r := nativeCall(t, s, call.action, call.inputs, nil)
		if r.Error != nil || r.Result == nil || !r.Result.Ok {
			t.Fatalf("native setup rejected: %+v", r)
		}
	}
}

func requireNativeCode(t *testing.T, r JSONRPCResponse, code string) {
	t.Helper()
	if r.Error != nil || r.Result == nil || r.Result.Ok || r.Result.Code != code {
		t.Fatalf("expected %s, got %+v / %+v", code, r.Error, r.Result)
	}
}

func TestNativeBindingRequiresNegotiationAndExactAuthority(t *testing.T) {
	s, a := nativeFixture(t)
	requireNativeCode(t, nativeCall(t, s, "bind_native_session", map[string]any{"protocol_version": 1, "authority": a}, nil), "LOCAL_PROTOCOL_REQUIRED")
	bindNative(t, s, a)
	r := nativeCall(t, s, "native_session_status", map[string]any{}, &a)
	if r.Result == nil || !r.Result.Ok {
		t.Fatalf("bound authority rejected: %+v", r)
	}
	requireNativeCode(t, nativeCall(t, s, "native_session_status", map[string]any{}, nil), "LOCAL_AUTHORITY_MISMATCH")
	for _, mutate := range []func(*nativeprotocol.Authority){
		func(v *nativeprotocol.Authority) { v.PrincipalID += "x" },
		func(v *nativeprotocol.Authority) { v.WorkspaceID += "x" },
		func(v *nativeprotocol.Authority) { v.Generation += "x" },
		func(v *nativeprotocol.Authority) { v.PolicyRevision++ },
		func(v *nativeprotocol.Authority) { v.GrantRevision++ },
	} {
		wrong := a
		mutate(&wrong)
		for _, action := range []string{"status", "native_session_status"} {
			requireNativeCode(t, nativeCall(t, s, action, map[string]any{}, &wrong), "LOCAL_AUTHORITY_MISMATCH")
		}
	}
	requireNativeCode(t, nativeCall(t, s, "bind_native_session", map[string]any{"protocol_version": 1, "authority": a}, nil), "LOCAL_SESSION_ALREADY_BOUND")
}

func TestNativeModeNeverDispatchesLegacyCapabilities(t *testing.T) {
	s, a := nativeFixture(t)
	actions := []string{"sync_root_grants", "read_file_secure", "list_directory_secure", "stat_path_secure", "create_file_secure", "write_file_secure", "create_directory_secure", "delete_path_secure", "move_path_secure", "read_file", "write_file", "patch_file", "run_command", "execute_command_secure", "discover_documents_secure", "extract_text_secure", "summarize_repo_secure", "start_workspace_ingestion", "semantic_search_secure", "insert_episodic_event", "search_episodic_events", "github_request", "ingest_repository", "semantic_search", "get_file_contents", "list_workspace", "future_unreviewed_action"}
	for _, action := range actions {
		requireNativeCode(t, nativeCall(t, s, action, map[string]any{}, nil), "LOCAL_SESSION_UNBOUND")
	}
	bindNative(t, s, a)
	for _, action := range actions {
		requireNativeCode(t, nativeCall(t, s, action, map[string]any{}, &a), "LOCAL_NATIVE_ACTION_DENIED")
	}
	if s.Work.Context().Err() != nil {
		t.Fatal("denied actions stopped lifecycle control")
	}
}

func TestNativeBindingRejectsVersionCompanyClaimsAndInitialRevisions(t *testing.T) {
	for _, change := range []string{"version", "principal", "workspace", "generation", "policy", "grant"} {
		t.Run(change, func(t *testing.T) {
			s, a := nativeFixture(t)
			nativeCall(t, s, "native_protocol", map[string]any{}, nil)
			version := 1
			switch change {
			case "version":
				version = 2
			case "principal":
				a.PrincipalID = "company-admin"
			case "workspace":
				a.WorkspaceID = "tenant-project"
			case "generation":
				a.Generation = ""
			case "policy":
				a.PolicyRevision = 2
			case "grant":
				a.GrantRevision = 1
			}
			r := nativeCall(t, s, "bind_native_session", map[string]any{"protocol_version": version, "authority": a}, nil)
			if r.Result == nil || r.Result.Ok {
				t.Fatalf("invalid authority accepted: %+v", r)
			}
			requireNativeCode(t, nativeCall(t, s, "native_session_status", map[string]any{}, &a), "LOCAL_SESSION_UNBOUND")
		})
	}
}

func TestNativeStrictFrameCannotStopServiceOrSmuggleClaims(t *testing.T) {
	s, a := nativeFixture(t)
	bindNative(t, s, a)
	for _, raw := range []string{
		`{"id":"x","jsonrpc":"2.0","authToken":"native-authority-regression","action":"shutdown","inputs":{"approved":true}}`,
		`{"id":"x","jsonrpc":"2.0","authToken":"native-authority-regression","action":"shutdown","inputs":{},"workspaceRoot":"/"}`,
		`{"id":"x","jsonrpc":"2.0","authToken":"native-authority-regression","action":"status","action":"shutdown","inputs":{}}`,
		`{"id":"x","jsonrpc":"2.0","authToken":"native-authority-regression","action":"shutdown","inputs":null}`,
		`{"id":"x","jsonrpc":"1.0","authToken":"native-authority-regression","action":"shutdown","inputs":{}}`,
		`{"jsonrpc":"2.0","authToken":"native-authority-regression","action":"shutdown","inputs":{}}`,
	} {
		w := httptest.NewRecorder()
		processFrame(w, t.Context(), s, []byte(raw))
		var r JSONRPCResponse
		_ = json.Unmarshal(w.Body.Bytes(), &r)
		if r.Error == nil || s.Work.Context().Err() != nil {
			t.Fatal("malformed native request reached dispatch")
		}
	}
	r := nativeCall(t, s, "shutdown", map[string]any{}, nil)
	if r.Result == nil || !r.Result.Ok || s.Work.Context().Err() == nil {
		t.Fatal("native lifecycle shutdown unavailable")
	}
}

func TestNativeBindIsAtomicUnderConcurrentRequests(t *testing.T) {
	s, a := nativeFixture(t)
	nativeCall(t, s, "native_protocol", map[string]any{}, nil)
	var wg sync.WaitGroup
	results := make(chan JSONRPCResponse, 2)
	for range 2 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			results <- nativeCall(t, s, "bind_native_session", map[string]any{"protocol_version": 1, "authority": a}, nil)
		}()
	}
	wg.Wait()
	close(results)
	accepted := 0
	for r := range results {
		if r.Result != nil && r.Result.Ok {
			accepted++
		}
	}
	if accepted != 1 {
		t.Fatalf("bound %d times", accepted)
	}
}

func TestNativeHeartbeatExcludesUnscopedTelemetry(t *testing.T) {
	s, a := nativeFixture(t)
	s.Telemetry.RecordEvent(telemetry.NewEvent("another-user", "another-workspace", "file_read", "private-file.txt", "read", 0, nil))
	bindNative(t, s, a)
	r := nativeCall(t, s, "status", map[string]any{}, &a)
	if r.Result == nil || !r.Result.Ok {
		t.Fatal("native status rejected")
	}
	var data struct {
		Events []any `json:"recent_events"`
		Count  int   `json:"event_count"`
	}
	if json.Unmarshal(r.Result.Data, &data) != nil || data.Count != 0 || len(data.Events) != 0 {
		t.Fatal("unscoped events crossed the native boundary")
	}
}
