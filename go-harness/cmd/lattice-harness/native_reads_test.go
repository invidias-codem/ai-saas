package main

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/invidias-codem/ai-saas/go-harness/internal/fsutil"
	"github.com/invidias-codem/ai-saas/go-harness/internal/nativeprotocol"
)

func readSnapshot(t *testing.T, dir string, revision uint64) nativeprotocol.GrantSnapshot {
	t.Helper()
	root, err := os.OpenRoot(dir)
	if err != nil {
		t.Fatal(err)
	}
	defer root.Close()
	identity, err := fsutil.ReadDirectoryIdentity(root)
	if err != nil {
		t.Fatal(err)
	}
	return nativeprotocol.GrantSnapshot{NextRevision: revision, Grants: []fsutil.ReadGrant{{ID: "local-grant-" + strings.Repeat("d", 32), Path: dir, Identity: identity}}}
}

func TestNativeDirectoryEntryLimitIsExplicit(t *testing.T) {
	s, a := nativeFixture(t)
	bindNative(t, s, a)
	dir := t.TempDir()
	for i := 0; i < 10000; i++ {
		if err := os.WriteFile(filepath.Join(dir, fmt.Sprintf("%05d", i)), nil, 0600); err != nil {
			t.Fatal(err)
		}
	}
	snapshot := readSnapshot(t, dir, 1)
	installReadSnapshot(t, s, &a, snapshot)
	input := nativeprotocol.ReadRequest{GrantID: snapshot.Grants[0].ID, RelativePath: "."}
	reply := nativeCall(t, s, "native_list", input, &a)
	var list nativeprotocol.DirectoryList
	if reply.Result == nil || !reply.Result.Ok || json.Unmarshal(reply.Result.Data, &list) != nil || len(list.Entries) != 10000 {
		t.Fatalf("exact directory limit rejected: %+v", reply.Result)
	}
	if err := os.WriteFile(filepath.Join(dir, "excess"), nil, 0600); err != nil {
		t.Fatal(err)
	}
	requireNativeCode(t, nativeCall(t, s, "native_list", input, &a), "LOCAL_DIRECTORY_TOO_LARGE")
}

func TestNativeDirectoryResponseByteLimitIsExplicit(t *testing.T) {
	s, a := nativeFixture(t)
	bindNative(t, s, a)
	dir := t.TempDir()
	for i := 0; i < 4500; i++ {
		name := fmt.Sprintf("%04d-%s", i, strings.Repeat("x", 220))
		if err := os.WriteFile(filepath.Join(dir, name), nil, 0600); err != nil {
			t.Fatal(err)
		}
	}
	snapshot := readSnapshot(t, dir, 1)
	installReadSnapshot(t, s, &a, snapshot)
	requireNativeCode(t, nativeCall(t, s, "native_list", nativeprotocol.ReadRequest{GrantID: snapshot.Grants[0].ID, RelativePath: "."}, &a), "LOCAL_DIRECTORY_TOO_LARGE")
}

func installReadSnapshot(t *testing.T, s *SessionContext, a *nativeprotocol.Authority, snapshot nativeprotocol.GrantSnapshot) {
	t.Helper()
	reply := nativeCall(t, s, "native_update_grants", snapshot, a)
	if reply.Error != nil || reply.Result == nil || !reply.Result.Ok {
		t.Fatalf("snapshot failed: %+v %+v", reply.Error, reply.Result)
	}
	a.GrantRevision = snapshot.NextRevision
	var ack nativeprotocol.GrantAcknowledgement
	if err := json.Unmarshal(reply.Result.Data, &ack); err != nil || ack.Authority != *a || len(ack.GrantIDs) != len(snapshot.Grants) {
		t.Fatalf("invalid ack: %+v %v", ack, err)
	}
}

func TestNativeReadsRequireCurrentScopedReadGrant(t *testing.T) {
	s, a := nativeFixture(t)
	bindNative(t, s, a)
	dir := t.TempDir()
	content := "# Selected project\n<script>alert('untrusted')</script>\n资料"
	if err := os.WriteFile(filepath.Join(dir, "note.md"), []byte(content), 0600); err != nil {
		t.Fatal(err)
	}
	snapshot := readSnapshot(t, dir, 1)
	req := nativeprotocol.ReadRequest{GrantID: snapshot.Grants[0].ID, RelativePath: "note.md"}
	requireNativeCode(t, nativeCall(t, s, "native_read_text", req, &a), "LOCAL_GRANT_DENIED")
	old := a
	installReadSnapshot(t, s, &a, snapshot)
	requireNativeCode(t, nativeCall(t, s, "native_read_text", req, &old), "LOCAL_AUTHORITY_MISMATCH")
	reply := nativeCall(t, s, "native_read_text", req, &a)
	var text nativeprotocol.TextRead
	if reply.Result == nil || !reply.Result.Ok || json.Unmarshal(reply.Result.Data, &text) != nil || text.Content != content || text.ByteCount != len(content) {
		t.Fatalf("unexpected text reply: %+v", reply.Result)
	}
	for _, action := range []string{"native_stat", "native_list"} {
		req.RelativePath = "."
		reply := nativeCall(t, s, action, req, &a)
		if reply.Result == nil || !reply.Result.Ok {
			t.Fatalf("%s: %+v", action, reply.Result)
		}
	}
	for _, action := range []string{"write_file_secure", "create_file_secure", "execute_command", "sync_root_grants", "semantic_search_secure"} {
		requireNativeCode(t, nativeCall(t, s, action, map[string]any{"path": filepath.Join(dir, "note.md"), "content": "changed"}, &a), "LOCAL_NATIVE_ACTION_DENIED")
	}
	body, err := os.ReadFile(filepath.Join(dir, "note.md"))
	if err != nil || string(body) != content {
		t.Fatal("native read grant permitted mutation")
	}
	req.RelativePath = "note.md"
	foreign := a
	foreign.WorkspaceID = "local-workspace-" + strings.Repeat("e", 32)
	requireNativeCode(t, nativeCall(t, s, "native_read_text", req, &foreign), "LOCAL_AUTHORITY_MISMATCH")
	req.GrantID = "local-grant-" + strings.Repeat("e", 32)
	requireNativeCode(t, nativeCall(t, s, "native_read_text", req, &a), "LOCAL_GRANT_DENIED")
	req.GrantID = snapshot.Grants[0].ID
	installReadSnapshot(t, s, &a, nativeprotocol.GrantSnapshot{NextRevision: 2, Grants: []fsutil.ReadGrant{}})
	requireNativeCode(t, nativeCall(t, s, "native_read_text", req, &a), "LOCAL_GRANT_DENIED")
	requireNativeCode(t, nativeCall(t, s, "native_read_text", req, &old), "LOCAL_AUTHORITY_MISMATCH")
}

func TestNativeGrantControlRequiresBoundCurrentAuthority(t *testing.T) {
	s, a := nativeFixture(t)
	dir := t.TempDir()
	snapshot := readSnapshot(t, dir, 1)
	requireNativeCode(t, nativeCall(t, s, "native_update_grants", snapshot, &a), "LOCAL_SESSION_UNBOUND")
	requireNativeCode(t, nativeCall(t, s, "native_list", nativeprotocol.ReadRequest{GrantID: snapshot.Grants[0].ID, RelativePath: "."}, &a), "LOCAL_SESSION_UNBOUND")
	bindNative(t, s, a)
	foreign := a
	foreign.Generation = strings.Repeat("f", 32)
	requireNativeCode(t, nativeCall(t, s, "native_update_grants", map[string]any{"approved": true}, &foreign), "LOCAL_AUTHORITY_MISMATCH")
	installReadSnapshot(t, s, &a, snapshot)
	for _, foreign := range []nativeprotocol.Authority{
		{PrincipalID: "local-user-" + strings.Repeat("f", 32), WorkspaceID: a.WorkspaceID, Generation: a.Generation, PolicyRevision: a.PolicyRevision, GrantRevision: a.GrantRevision},
		{PrincipalID: a.PrincipalID, WorkspaceID: a.WorkspaceID, Generation: strings.Repeat("f", 32), PolicyRevision: a.PolicyRevision, GrantRevision: a.GrantRevision},
		{PrincipalID: a.PrincipalID, WorkspaceID: a.WorkspaceID, Generation: a.Generation, PolicyRevision: 2, GrantRevision: a.GrantRevision},
	} {
		requireNativeCode(t, nativeCall(t, s, "native_list", nativeprotocol.ReadRequest{GrantID: snapshot.Grants[0].ID, RelativePath: "."}, &foreign), "LOCAL_AUTHORITY_MISMATCH")
	}
	reply := nativeCall(t, s, "native_list", nativeprotocol.ReadRequest{GrantID: snapshot.Grants[0].ID, RelativePath: "."}, &a)
	if reply.Result == nil || !reply.Result.Ok {
		t.Fatalf("foreign control poisoned owner: %+v", reply.Result)
	}
}

func TestNativeFailedSnapshotsBlockOldAndNewGrants(t *testing.T) {
	for _, fault := range []string{"revision", "missing-root", "identity", "duplicate-id", "missing-field", "case-alias", "unknown-field", "null-list"} {
		t.Run(fault, func(t *testing.T) {
			s, a := nativeFixture(t)
			bindNative(t, s, a)
			dir := t.TempDir()
			snapshot := readSnapshot(t, dir, 1)
			installReadSnapshot(t, s, &a, snapshot)
			raw, _ := json.Marshal(snapshot)
			var inputs map[string]any
			_ = json.Unmarshal(raw, &inputs)
			inputs["next_revision"] = 2
			grant := inputs["grants"].([]any)[0].(map[string]any)
			switch fault {
			case "revision":
				inputs["next_revision"] = 1
			case "missing-root":
				grant["grant_id"] = "local-grant-" + strings.Repeat("f", 32)
				grant["path"] = filepath.Join(dir, "missing")
			case "identity":
				grant["directory_identity"].(map[string]any)["file"] = "0000000000000000"
			case "duplicate-id":
				inputs["grants"] = []any{grant, grant}
			case "missing-field":
				delete(grant, "path")
			case "case-alias":
				grant["Path"] = grant["path"]
				delete(grant, "path")
			case "unknown-field":
				grant["read_only"] = false
			case "null-list":
				inputs["grants"] = nil
			}
			requireNativeCode(t, nativeCall(t, s, "native_update_grants", inputs, &a), "LOCAL_GRANT_UPDATE_FAILED")
			req := nativeprotocol.ReadRequest{GrantID: snapshot.Grants[0].ID, RelativePath: "."}
			requireNativeCode(t, nativeCall(t, s, "native_list", req, &a), "LOCAL_WORKSPACE_BLOCKED")
			requireNativeCode(t, nativeCall(t, s, "status", map[string]any{}, &a), "LOCAL_WORKSPACE_BLOCKED")
		})
	}
}

func TestNativeReadBoundariesAndStrictSchemas(t *testing.T) {
	s, a := nativeFixture(t)
	bindNative(t, s, a)
	dir := t.TempDir()
	snapshot := readSnapshot(t, dir, 1)
	installReadSnapshot(t, s, &a, snapshot)
	for _, test := range []struct {
		name, code string
		body       []byte
	}{
		{"exact.txt", "", []byte(strings.Repeat("x", fsutil.MaxLocalReadBytes))},
		{"large.txt", "LOCAL_FILE_TOO_LARGE", []byte(strings.Repeat("x", fsutil.MaxLocalReadBytes+1))},
		{"binary.txt", "LOCAL_TEXT_UNSUPPORTED", []byte{0xff, 0xfe}},
		{"with-nul.txt", "LOCAL_TEXT_UNSUPPORTED", []byte{'a', 0, 'b'}},
	} {
		if err := os.WriteFile(filepath.Join(dir, test.name), test.body, 0600); err != nil {
			t.Fatal(err)
		}
		reply := nativeCall(t, s, "native_read_text", nativeprotocol.ReadRequest{GrantID: snapshot.Grants[0].ID, RelativePath: test.name}, &a)
		if test.code != "" {
			requireNativeCode(t, reply, test.code)
		} else if reply.Result == nil || !reply.Result.Ok {
			t.Fatalf("exact limit rejected: %+v", reply.Result)
		}
	}
	for _, path := range []string{"../outside", "/etc/passwd", `C:\Windows`, `\\host\share`, "file:stream", "NUL.txt", "https://host/file", "a/../b"} {
		requireNativeCode(t, nativeCall(t, s, "native_read_text", nativeprotocol.ReadRequest{GrantID: snapshot.Grants[0].ID, RelativePath: path}, &a), "LOCAL_PATH_INVALID")
	}
	for _, inputs := range []map[string]any{
		{"grant_id": snapshot.Grants[0].ID, "path": "."},
		{"grant_id": snapshot.Grants[0].ID, "relative_path": ".", "user_id": a.PrincipalID},
		{"grant_id": snapshot.Grants[0].ID, "relative_path": nil},
	} {
		reply := nativeCall(t, s, "native_list", inputs, &a)
		if reply.Error == nil {
			t.Fatalf("malformed read accepted: %+v", reply.Result)
		}
	}
}

func TestNativeRootPinningAndDirectoryEscape(t *testing.T) {
	s, a := nativeFixture(t)
	bindNative(t, s, a)
	base := t.TempDir()
	dir := filepath.Join(base, "selected")
	outside := filepath.Join(base, "outside")
	for _, path := range []string{dir, outside} {
		if err := os.Mkdir(path, 0700); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(filepath.Join(dir, "note.txt"), []byte("selected"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(outside, "secret.txt"), []byte("outside"), 0600); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(dir, "escape")
	if runtime.GOOS == "windows" {
		if output, err := exec.Command("cmd", "/c", "mklink", "/J", link, outside).CombinedOutput(); err != nil {
			t.Fatalf("junction fixture failed: %v %s", err, output)
		}
	} else if err := os.Symlink(outside, link); err != nil {
		t.Fatal(err)
	}
	snapshot := readSnapshot(t, dir, 1)
	installReadSnapshot(t, s, &a, snapshot)
	req := nativeprotocol.ReadRequest{GrantID: snapshot.Grants[0].ID, RelativePath: "escape/secret.txt"}
	for _, action := range []string{"native_read_text", "native_list", "native_stat"} {
		reply := nativeCall(t, s, action, req, &a)
		if reply.Result == nil || reply.Result.Ok || strings.Contains(string(reply.Result.Data), "outside") {
			t.Fatalf("escape admitted: %+v", reply.Result)
		}
	}
	if err := os.Rename(dir, filepath.Join(base, "pinned")); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(dir, 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "note.txt"), []byte("replacement"), 0600); err != nil {
		t.Fatal(err)
	}
	snapshot.NextRevision = 2
	installReadSnapshot(t, s, &a, snapshot)
	req.RelativePath = "note.txt"
	reply := nativeCall(t, s, "native_read_text", req, &a)
	var text nativeprotocol.TextRead
	if reply.Result == nil || !reply.Result.Ok || json.Unmarshal(reply.Result.Data, &text) != nil || text.Content != "selected" {
		t.Fatalf("root silently rebound: %+v", reply.Result)
	}
}
