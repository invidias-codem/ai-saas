package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/invidias-codem/ai-saas/go-harness/harness"
	"github.com/invidias-codem/ai-saas/go-harness/internal/fsutil"
	"github.com/invidias-codem/ai-saas/go-harness/internal/telemetry"
)

// Regressions for the review of #448. All file access
// uses disposable fixtures; the network test uses an in-process loopback server.
func reviewRPC(t *testing.T, root, action string, inputs map[string]any) harness.ToolExecutionResult {
	t.Helper()
	previous := expectedToken
	expectedToken = "review-dummy-launch-token"
	t.Cleanup(func() { expectedToken = previous; cleanupHarnesses() })
	session := &SessionContext{Registry: fsutil.NewRootRegistry(), Telemetry: telemetry.NewManager()}
	defer session.Registry.Close()
	defer session.Telemetry.Close()
	if err := session.Registry.UpdateGrants([]fsutil.RootGrant{{Path: root, UserID: "employee", WorkspaceID: "project"}}); err != nil {
		t.Fatal(err)
	}
	frame, err := json.Marshal(map[string]any{
		"id": "review", "jsonrpc": "2.0", "workspaceRoot": root,
		"authToken": expectedToken, "action": action, "inputs": inputs,
	})
	if err != nil {
		t.Fatal(err)
	}
	w := httptest.NewRecorder()
	processFrame(w, context.Background(), session, frame)
	var response struct {
		Result harness.ToolExecutionResult `json:"result"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	return response.Result
}

func reviewSymlinkFixture(t *testing.T) (string, string, string) {
	t.Helper()
	base := t.TempDir()
	root := filepath.Join(base, "authorized")
	if err := os.Mkdir(root, 0700); err != nil {
		t.Fatal(err)
	}
	outsideDir := filepath.Join(base, "outside")
	if err := os.Mkdir(outsideDir, 0700); err != nil {
		t.Fatal(err)
	}
	outside := filepath.Join(outsideDir, "document.txt")
	if err := os.WriteFile(outside, []byte("outside-fixture"), 0600); err != nil {
		t.Fatal(err)
	}
	linkDir := filepath.Join(root, "escape")
	if err := os.Symlink(outsideDir, linkDir); err != nil {
		if runtime.GOOS != "windows" {
			t.Fatal(err)
		}
		if output, junctionErr := exec.Command("cmd.exe", "/d", "/c", "mklink", "/J", linkDir, outsideDir).CombinedOutput(); junctionErr != nil {
			t.Fatalf("cannot create Windows junction fixture: %v %s", junctionErr, output)
		}
	}
	link := filepath.Join(linkDir, "document.txt")
	return root, link, outside
}

func TestReviewAuthenticatedSecureReadCannotEscapeGrant(t *testing.T) {
	root, link, _ := reviewSymlinkFixture(t)
	control, err := harness.NewLocalIOHarness(root)
	if err != nil {
		t.Fatal(err)
	}
	defer control.Close()
	if got := control.ReadFile(context.Background(), link); got.Ok {
		t.Fatal("os.Root control unexpectedly allowed escape")
	}
	got := reviewRPC(t, root, "read_file_secure", map[string]any{
		"path": link, "user_id": "employee", "workspace_id": "project",
	})
	if got.Ok {
		t.Fatalf("authenticated secure RPC escaped grant through symlink: %q", got.Output)
	}
}

func TestReviewAuthenticatedSecureWriteCannotEscapeGrant(t *testing.T) {
	root, link, outside := reviewSymlinkFixture(t)
	got := reviewRPC(t, root, "write_file_secure", map[string]any{
		"path": link, "content": "changed-outside-fixture", "user_id": "employee", "workspace_id": "project",
	})
	after, err := os.ReadFile(outside)
	if err != nil {
		t.Fatal(err)
	}
	if got.Ok || string(after) != "outside-fixture" {
		t.Fatalf("secure RPC changed file outside grant: ok=%v contents=%q", got.Ok, after)
	}
}

func TestReviewAuthenticatedFileReadRequiresGrantIdentity(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "document.txt")
	if err := os.WriteFile(path, []byte("project-fixture"), 0600); err != nil {
		t.Fatal(err)
	}
	got := reviewRPC(t, root, "read_file_secure", map[string]any{
		"path": path, "user_id": "different-employee", "workspace_id": "different-project",
	})
	if got.Ok {
		t.Fatal("secure RPC accepted another user/workspace's grant")
	}
}

func TestRPCLegacyFilesCannotChooseTheirOwnAuthority(t *testing.T) {
	root := t.TempDir()
	file := filepath.Join(root, "document.txt")
	if err := os.WriteFile(file, []byte("unchanged"), 0600); err != nil {
		t.Fatal(err)
	}
	for _, action := range []string{"read_file", "write_file", "patch_file"} {
		got := reviewRPC(t, root, action, map[string]any{"filePath": file, "content": "changed", "search_block": "unchanged", "replace_block": "changed"})
		if got.Ok || got.Code != "FILE_ACCESS_DENIED" {
			t.Fatalf("%s bypassed grants: %+v", action, got)
		}
	}
	content, err := os.ReadFile(file)
	if err != nil || string(content) != "unchanged" {
		t.Fatal("legacy operation modified a file")
	}
}

func TestRPCLaunchCredentialCannotBeUsedUpstream(t *testing.T) {
	previous := expectedToken
	expectedToken = "dummy-launch-token"
	defer func() { expectedToken = previous }()
	session := &SessionContext{Registry: fsutil.NewRootRegistry(), Telemetry: telemetry.NewManager()}
	defer session.Registry.Close()
	defer session.Telemetry.Close()
	for action, inputs := range map[string]map[string]any{
		"github_request":         {"url": "https://api.github.com/user", "method": "GET", "githubToken": expectedToken},
		"semantic_search_secure": {"query": "fixture", "auth_token": expectedToken},
		"sync_root_grants":       {"api_base_url": "https://gen1e.xyz", "auth_token": expectedToken},
	} {
		frame, _ := json.Marshal(map[string]any{"id": "fixture", "jsonrpc": "2.0", "authToken": expectedToken, "action": action, "inputs": inputs})
		response := httptest.NewRecorder()
		processFrame(response, t.Context(), session, frame)
		if !strings.Contains(response.Body.String(), "aunch credentials cannot be used upstream") {
			t.Fatalf("%s admitted launch credential: %s", action, response.Body.String())
		}
	}
}

func TestReviewGitHubRequestRejectsOtherHosts(t *testing.T) {
	type observation struct{ method, authorization string }
	received := make(chan observation, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		received <- observation{r.Method, r.Header.Get("Authorization")}
		w.Write([]byte("loopback-fixture"))
	}))
	defer server.Close()
	got, err := harness.ExecuteGitHubRequest(context.Background(), "POST", server.URL, "{}", "review-dummy-token", []string{"permitted/repository"})
	if err != nil {
		t.Fatal(err)
	}
	select {
	case observed := <-received:
		t.Fatalf("GitHub wrapper sent %s to non-GitHub host with credential %q (ok=%v)", observed.method, observed.authorization, got.Ok)
	default:
	}
}
