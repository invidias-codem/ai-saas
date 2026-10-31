package main

import (
	"encoding/json"
	"github.com/invidias-codem/ai-saas/go-harness/internal/nativeprotocol"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestNativeCommandControlIsStrictAndScopeBound(t *testing.T) {
	s, a := nativeFixture(t)
	id := "local-proposal-" + strings.Repeat("e", 32)
	grant := "local-grant-" + strings.Repeat("d", 32)
	command := map[string]any{"shell": "sh", "script": "printf no-launch"}
	inputs := map[string]any{"native_prepare_command": map[string]any{"proposal_id": id, "operation": map[string]any{"kind": "execute_command", "grant_id": grant, "relative_path": ".", "command": command}}, "native_dispatch_command": map[string]any{"proposal_id": id, "digest": strings.Repeat("f", 64)}, "native_command_status": map[string]any{"proposal_id": id}, "native_cancel_command": map[string]any{"proposal_id": id}, "native_command_output": map[string]any{"proposal_id": id}}
	for action, input := range inputs {
		requireNativeCode(t, nativeCall(t, s, action, input, &a), "LOCAL_SESSION_UNBOUND")
	}
	bindNative(t, s, a)
	for action, input := range inputs {
		requireNativeCode(t, nativeCall(t, s, action, input, nil), "LOCAL_AUTHORITY_MISMATCH")
		for _, change := range []func(*nativeprotocol.Authority){func(a *nativeprotocol.Authority) { a.PrincipalID += "x" }, func(a *nativeprotocol.Authority) { a.WorkspaceID += "x" }, func(a *nativeprotocol.Authority) { a.Generation += "x" }, func(a *nativeprotocol.Authority) { a.PolicyRevision++ }, func(a *nativeprotocol.Authority) { a.GrantRevision++ }} {
			wrong := a
			change(&wrong)
			requireNativeCode(t, nativeCall(t, s, action, input, &wrong), "LOCAL_AUTHORITY_MISMATCH")
		}
		raw, _ := json.Marshal(input)
		for _, field := range []string{"approved", "environment", "provider", "requires_sandbox", "authority"} {
			var forged map[string]any
			_ = json.Unmarshal(raw, &forged)
			forged[field] = true
			reply := nativeCall(t, s, action, forged, &a)
			if reply.Error == nil || reply.Error.Code != -32602 {
				t.Fatal("caller control field accepted", action, field)
			}
		}
	}
	for _, field := range []string{"approved", "env", "path", "requires_sandbox", "provider"} {
		forged := map[string]any{"shell": "sh", "script": "printf no-launch", field: true}
		reply := nativeCall(t, s, "native_prepare_command", map[string]any{"proposal_id": id, "operation": map[string]any{"kind": "execute_command", "grant_id": grant, "relative_path": ".", "command": forged}}, &a)
		if reply.Error == nil || reply.Error.Code != -32602 {
			t.Fatal("command accepted caller execution policy", field)
		}
	}
}

func TestRealNativeCommandRPCDeniesAllSupportedModesAndLegacyBypasses(t *testing.T) {
	s, a := nativeFixture(t)
	bindNative(t, s, a)
	dir := t.TempDir()
	snapshot := readSnapshot(t, dir, 1)
	installReadSnapshot(t, s, &a, snapshot)
	commands := []map[string]any{{"shell": "direct", "executable": "sh", "argv": []string{"-c", "printf no-launch > executed.txt"}}, {"shell": "sh", "script": "printf no-launch > executed.txt"}}
	if runtime.GOOS == "windows" {
		commands = []map[string]any{{"shell": "direct", "executable": "cmd.exe", "argv": []string{"/d", "/s", "/c", "echo no-launch>executed.txt"}}, {"shell": "cmd", "script": "echo no-launch>executed.txt"}, {"shell": "powershell", "script": "[IO.File]::WriteAllText('executed.txt','no-launch')"}, {"shell": "pwsh", "script": "[IO.File]::WriteAllText('executed.txt','no-launch')"}}
	}
	for i, command := range commands {
		id := "local-proposal-" + strings.Repeat(string(rune('a'+i)), 32)
		reply := nativeCall(t, s, "native_prepare_command", map[string]any{"proposal_id": id, "operation": map[string]any{"kind": "execute_command", "grant_id": snapshot.Grants[0].ID, "relative_path": ".", "command": command}}, &a)
		if reply.Result != nil && !reply.Result.Ok && reply.Result.Code == "LOCAL_SHELL_UNAVAILABLE" && command["shell"] == "pwsh" {
			continue
		}
		var p nativeprotocol.PreparedMutation
		if reply.Result == nil || !reply.Result.Ok || json.Unmarshal(reply.Result.Data, &p) != nil {
			t.Fatal("supported command preparation failed")
		}
		input := nativeprotocol.DispatchMutationRequest{ProposalID: id, Digest: p.Digest}
		requireNativeCode(t, nativeCall(t, s, "native_dispatch_mutation", input, &a), "LOCAL_REVIEW_DENIED")
		reply = nativeCall(t, s, "native_dispatch_command", input, &a)
		var status nativeprotocol.OperationStatus
		if reply.Result == nil || !reply.Result.Ok || json.Unmarshal(reply.Result.Data, &status) != nil || status.Code != "LOCAL_SANDBOX_REQUIRED" || status.MayHaveChanged {
			t.Fatal("native command launched without a qualified provider")
		}
		requireNativeCode(t, nativeCall(t, s, "native_dispatch_command", input, &a), "LOCAL_OPERATION_REPLAYED")
	}
	for _, action := range []string{"run_command", "execute_command_secure", "native_register_provider", "set_sandbox_provider"} {
		requireNativeCode(t, nativeCall(t, s, action, map[string]any{"approved": true, "requires_sandbox": false}, &a), "LOCAL_NATIVE_ACTION_DENIED")
	}
	if _, err := os.Stat(filepath.Join(dir, "executed.txt")); !os.IsNotExist(err) {
		t.Fatal("unqualified command side effect")
	}
}
