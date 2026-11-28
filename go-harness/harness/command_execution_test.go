package harness

import (
	"context"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/invidias-codem/ai-saas/go-harness/internal/executil"
	"github.com/invidias-codem/ai-saas/go-harness/internal/fsutil"
	"github.com/invidias-codem/ai-saas/go-harness/internal/telemetry"
)

func TestExecuteCommandAuthorization(t *testing.T) {
	for _, variant := range []string{"other-user", "other-workspace", "read-only", "no-execution-consent", "missing-identity", "outside-root"} {
		t.Run(variant, func(t *testing.T) {
			registry, tel, dir := setupCommandTestEnv(t)
			grant := fsutil.RootGrant{Path: dir, UserID: "user_1", WorkspaceID: "test_workspace_1", AllowDestructive: true}
			req := CommandRequest{Path: dir, UserID: grant.UserID, WorkspaceID: grant.WorkspaceID, Command: "echo should-not-run"}
			switch variant {
			case "other-user":
				req.UserID = "intruder"
			case "other-workspace":
				req.WorkspaceID = "other"
			case "read-only":
				grant.ReadOnly = true
			case "no-execution-consent":
				grant.AllowDestructive = false
			case "missing-identity":
				req.UserID = ""
			case "outside-root":
				req.Path = t.TempDir()
			}
			registry.UpdateGrants([]fsutil.RootGrant{grant})
			res := ExecuteCommand(context.Background(), registry, tel, req)
			if res.Ok || res.Code != "COMMAND_ACCESS_DENIED" {
				t.Fatalf("expected denial, got %+v", res)
			}
		})
	}
}

func TestExecuteCommandShell(t *testing.T) {
	registry, tel, dir := setupCommandTestEnv(t)
	registry.UpdateGrants([]fsutil.RootGrant{{Path: dir, UserID: "user_1", WorkspaceID: "test_workspace_1", AllowDestructive: true}})
	shell, script := executil.SH, `printf 'project output'; exit 7`
	if runtime.GOOS == "windows" {
		shell, script = executil.CMD, `echo project output & exit /b 7`
	}
	res := ExecuteCommand(context.Background(), registry, tel, CommandRequest{Path: dir, UserID: "user_1", WorkspaceID: "test_workspace_1", Command: script, Shell: shell, TimeoutSeconds: 5})
	if res.Ok || !strings.Contains(res.Output, "project output") || !strings.Contains(string(res.Data), `"code":7`) {
		t.Fatalf("lost command outcome: %+v", res)
	}
}

func TestExecuteCommandSymlinkEscape(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("symlink creation requires additional Windows privileges")
	}
	registry, tel, dir := setupCommandTestEnv(t)
	registry.UpdateGrants([]fsutil.RootGrant{{Path: dir, UserID: "user_1", WorkspaceID: "test_workspace_1", AllowDestructive: true}})
	outside := t.TempDir()
	link := filepath.Join(dir, "escape")
	if err := os.Symlink(outside, link); err != nil {
		t.Fatal(err)
	}
	res := ExecuteCommand(context.Background(), registry, tel, CommandRequest{Path: link, UserID: "user_1", WorkspaceID: "test_workspace_1", Command: "echo forbidden"})
	if res.Ok || res.Code != "COMMAND_ACCESS_DENIED" {
		t.Fatalf("symlink escaped: %+v", res)
	}
}

func TestExecuteCommandGrantedDirectoryAlias(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Windows short-path grants are exercised by TestExecuteCommandShell and RPC tests")
	}
	registry, tel, dir := setupCommandTestEnv(t)
	alias := filepath.Join(t.TempDir(), "project-alias")
	if err := os.Symlink(dir, alias); err != nil {
		t.Fatal(err)
	}
	registry.UpdateGrants([]fsutil.RootGrant{{Path: alias, UserID: "employee", WorkspaceID: "project", AllowDestructive: true}})
	res := ExecuteCommand(context.Background(), registry, tel, CommandRequest{Path: dir, UserID: "employee", WorkspaceID: "project", Shell: executil.SH, Command: "printf approved"})
	if !res.Ok || res.Output != "approved" {
		t.Fatalf("canonical grant alias rejected: %+v", res)
	}
}

func setupCommandTestEnv(t *testing.T) (*fsutil.RootRegistry, *telemetry.Manager, string) {
	dir := t.TempDir()
	registry := fsutil.NewRootRegistry()
	t.Cleanup(func() { _ = registry.Close() })
	return registry, telemetry.NewManager(), dir
}
