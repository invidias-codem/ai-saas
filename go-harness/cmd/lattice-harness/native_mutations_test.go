package main

import (
	"encoding/json"
	"github.com/invidias-codem/ai-saas/go-harness/internal/nativeprotocol"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestNativeMutationEndpointsRequireBoundCurrentAuthorityAndClosedInputs(t *testing.T) {
	s, a := nativeFixture(t)
	id := "local-proposal-" + strings.Repeat("e", 32)
	grant := "local-grant-" + strings.Repeat("d", 32)
	inputs := map[string]any{
		"native_prepare_mutation":  map[string]any{"proposal_id": id, "operation": map[string]any{"kind": "create_file", "grant_id": grant, "relative_path": "new", "content": "exact"}},
		"native_dispatch_mutation": map[string]any{"proposal_id": id, "digest": strings.Repeat("f", 64)},
		"native_mutation_status":   map[string]any{"proposal_id": id},
		"native_cancel_mutation":   map[string]any{"proposal_id": id},
	}
	for action, input := range inputs {
		requireNativeCode(t, nativeCall(t, s, action, input, &a), "LOCAL_SESSION_UNBOUND")
	}
	bindNative(t, s, a)
	for action, input := range inputs {
		for _, mutate := range []func(*nativeprotocol.Authority){func(v *nativeprotocol.Authority) { v.PrincipalID += "wrong" }, func(v *nativeprotocol.Authority) { v.WorkspaceID += "wrong" }, func(v *nativeprotocol.Authority) { v.Generation += "wrong" }, func(v *nativeprotocol.Authority) { v.PolicyRevision++ }, func(v *nativeprotocol.Authority) { v.GrantRevision++ }} {
			wrong := a
			mutate(&wrong)
			requireNativeCode(t, nativeCall(t, s, action, input, &wrong), "LOCAL_AUTHORITY_MISMATCH")
		}
		requireNativeCode(t, nativeCall(t, s, action, input, nil), "LOCAL_AUTHORITY_MISMATCH")
		raw, _ := json.Marshal(map[string]any{"id": "auth-test", "jsonrpc": "2.0", "authToken": "wrong", "action": action, "inputs": input, "authority": a})
		w := httptest.NewRecorder()
		processFrame(w, t.Context(), s, raw)
		var response JSONRPCResponse
		if json.Unmarshal(w.Body.Bytes(), &response) != nil || response.Error == nil || response.Error.Code != -32000 {
			t.Fatal("mutation bypassed launch authentication")
		}
		for _, field := range []string{"approved", "content", "base", "authority", "writable"} {
			raw, _ := json.Marshal(input)
			var forged map[string]any
			_ = json.Unmarshal(raw, &forged)
			forged[field] = true
			reply := nativeCall(t, s, action, forged, &a)
			if reply.Error == nil || reply.Error.Code != -32602 {
				t.Fatalf("%s accepted %s", action, field)
			}
		}
	}
	for _, kind := range []string{"delete_path", "move_path", "execute_command", "write_file", "patch_file"} {
		req := map[string]any{"proposal_id": id, "operation": map[string]any{"kind": kind, "grant_id": grant, "relative_path": "new", "content": "exact"}}
		requireNativeCode(t, nativeCall(t, s, "native_prepare_mutation", req, &a), "LOCAL_PROPOSAL_INVALID")
	}
}

func TestNativeMutationRPCUsesStoredTargetAndReturnsOwnedResult(t *testing.T) {
	s, a := nativeFixture(t)
	bindNative(t, s, a)
	dir := t.TempDir()
	snapshot := readSnapshot(t, dir, 1)
	snapshot.Grants[0].Writable = true
	installReadSnapshot(t, s, &a, snapshot)
	id := "local-proposal-" + strings.Repeat("e", 32)
	req := map[string]any{"proposal_id": id, "operation": map[string]any{"kind": "create_file", "grant_id": snapshot.Grants[0].ID, "relative_path": "new.txt", "content": "reviewed"}}
	reply := nativeCall(t, s, "native_prepare_mutation", req, &a)
	var prepared nativeprotocol.PreparedMutation
	if reply.Result == nil || !reply.Result.Ok || json.Unmarshal(reply.Result.Data, &prepared) != nil {
		t.Fatal("prepare failed")
	}
	forged := map[string]any{"proposal_id": id, "digest": prepared.Digest, "operation": map[string]any{"relative_path": "different.txt", "content": "forged"}}
	if got := nativeCall(t, s, "native_dispatch_mutation", forged, &a); got.Error == nil || got.Error.Code != -32602 {
		t.Fatal("dispatch accepted replacement intent")
	}
	dispatch := nativeprotocol.DispatchMutationRequest{ProposalID: id, Digest: prepared.Digest}
	reply = nativeCall(t, s, "native_dispatch_mutation", dispatch, &a)
	if reply.Result == nil || !reply.Result.Ok {
		t.Fatal("dispatch failed")
	}
	deadline := time.Now().Add(3 * time.Second)
	done := false
	for time.Now().Before(deadline) {
		reply = nativeCall(t, s, "native_mutation_status", nativeprotocol.OperationReference{ProposalID: id}, &a)
		var status nativeprotocol.OperationStatus
		if reply.Result == nil || !reply.Result.Ok || json.Unmarshal(reply.Result.Data, &status) != nil {
			t.Fatal("status failed")
		}
		if status.Status != "running" {
			if status.Status != "succeeded" || !status.MayHaveChanged {
				t.Fatal(status)
			}
			done = true
			break
		}
		time.Sleep(time.Millisecond)
	}
	if !done {
		t.Fatal("owned work unfinished")
	}
	data, err := os.ReadFile(filepath.Join(dir, "new.txt"))
	if err != nil || string(data) != "reviewed" {
		t.Fatal("wrong effect", err)
	}
	if _, err := os.Stat(filepath.Join(dir, "different.txt")); !os.IsNotExist(err) {
		t.Fatal("forged target touched")
	}
	requireNativeCode(t, nativeCall(t, s, "native_dispatch_mutation", dispatch, &a), "LOCAL_OPERATION_REPLAYED")
}
