package harness

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/invidias-codem/ai-saas/go-harness/internal/fsutil"
	"github.com/invidias-codem/ai-saas/go-harness/internal/telemetry"
)

func TestFileIdentityBoundaryAcrossCapabilities(t *testing.T) {
	dir := t.TempDir()
	file := filepath.Join(dir, "document.txt")
	if err := os.WriteFile(file, []byte("unchanged"), 0600); err != nil {
		t.Fatal(err)
	}
	registry := fsutil.NewRootRegistry()
	defer registry.Close()
	if err := registry.UpdateGrants([]fsutil.RootGrant{{Path: dir, UserID: "employee", WorkspaceID: "project", AllowDestructive: true}}); err != nil {
		t.Fatal(err)
	}
	tel := telemetry.NewManager()
	defer tel.Close()
	for _, identity := range [][2]string{{"other", "project"}, {"employee", "other"}, {"", "project"}, {"employee", ""}} {
		user, workspace := identity[0], identity[1]
		operations := map[string]func() ToolExecutionResult{
			"read":  func() ToolExecutionResult { return ReadFileSecure(registry, tel, file, workspace, user) },
			"list":  func() ToolExecutionResult { return ListDirectorySecure(registry, tel, dir, workspace, user) },
			"stat":  func() ToolExecutionResult { return StatPathSecure(registry, tel, file, workspace, user) },
			"write": func() ToolExecutionResult { return WriteFileSecure(registry, tel, file, "changed", workspace, user) },
			"create": func() ToolExecutionResult {
				return CreateFileSecure(registry, tel, filepath.Join(dir, "new"), workspace, user)
			},
			"mkdir": func() ToolExecutionResult {
				return CreateDirectorySecure(registry, tel, filepath.Join(dir, "newdir"), workspace, user)
			},
			"move": func() ToolExecutionResult {
				return MovePathSecure(registry, tel, file, filepath.Join(dir, "moved"), workspace, user)
			},
			"delete":   func() ToolExecutionResult { return DeletePathSecure(registry, tel, file, workspace, user) },
			"discover": func() ToolExecutionResult { return DiscoverDocumentsSecure(registry, tel, dir, workspace, user) },
			"extract":  func() ToolExecutionResult { return ExtractTextSecure(registry, tel, file, workspace, user) },
			"summary":  func() ToolExecutionResult { return SummarizeRepoSecure(registry, tel, dir, workspace, user) },
			"ingest": func() ToolExecutionResult {
				return StartWorkspaceIngestion(registry, tel, nil, dir, workspace, user, "", "")
			},
		}
		for name, operation := range operations {
			if got := operation(); got.Ok {
				t.Fatalf("%s accepted identity %q/%q", name, user, workspace)
			}
		}
	}
	content, err := os.ReadFile(file)
	if err != nil || string(content) != "unchanged" {
		t.Fatalf("denied operation changed original: %q %v", content, err)
	}
	entries, err := os.ReadDir(dir)
	if err != nil || len(entries) != 1 {
		t.Fatal("denied operation created or moved a path")
	}
}

func TestFileGrantPinnedAcrossDirectoryReplacement(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Windows prevents renaming an open Root; junction escape has a separate test")
	}
	base := t.TempDir()
	dir := filepath.Join(base, "authorized")
	outside := filepath.Join(base, "outside")
	for _, p := range []string{dir, outside} {
		if err := os.Mkdir(p, 0700); err != nil {
			t.Fatal(err)
		}
	}
	for p, content := range map[string]string{filepath.Join(dir, "document.txt"): "original", filepath.Join(outside, "document.txt"): "outside"} {
		if err := os.WriteFile(p, []byte(content), 0600); err != nil {
			t.Fatal(err)
		}
	}
	registry := fsutil.NewRootRegistry()
	defer registry.Close()
	if err := registry.UpdateGrants([]fsutil.RootGrant{{Path: dir, UserID: "employee", WorkspaceID: "project"}}); err != nil {
		t.Fatal(err)
	}
	if err := os.Rename(dir, filepath.Join(base, "moved")); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, dir); err != nil {
		t.Fatal(err)
	}
	tel := telemetry.NewManager()
	defer tel.Close()
	got := ReadFileSecure(registry, tel, filepath.Join(dir, "document.txt"), "project", "employee")
	if !got.Ok || got.Output != "original" {
		t.Fatalf("directory replacement changed authority: %+v", got)
	}
	registry.UpdateGrants(nil)
	if got := ReadFileSecure(registry, tel, filepath.Join(dir, "document.txt"), "project", "employee"); got.Ok {
		t.Fatal("revoked grant remained usable")
	}
}

func TestFileNestedReadOnlyGrantAndRootMutation(t *testing.T) {
	dir := t.TempDir()
	nested := filepath.Join(dir, "readonly")
	if err := os.Mkdir(nested, 0700); err != nil {
		t.Fatal(err)
	}
	registry := fsutil.NewRootRegistry()
	defer registry.Close()
	if err := registry.UpdateGrants([]fsutil.RootGrant{{Path: dir, UserID: "employee", WorkspaceID: "project", AllowDestructive: true}, {Path: nested, UserID: "employee", WorkspaceID: "project", ReadOnly: true}}); err != nil {
		t.Fatal(err)
	}
	tel := telemetry.NewManager()
	defer tel.Close()
	if got := WriteFileSecure(registry, tel, filepath.Join(nested, "new.txt"), "bad", "project", "employee"); got.Ok {
		t.Fatal("parent grant overrode nested read-only grant")
	}
	if got := DeletePathSecure(registry, tel, dir, "project", "employee"); got.Ok {
		t.Fatal("grant root deletion was allowed")
	}
	if got := CreateFileSecure(registry, tel, filepath.Join(dir, "new.txt"), "project", "employee"); !got.Ok {
		t.Fatalf("authorized create rejected: %+v", got)
	}
	if got := CreateFileSecure(registry, tel, filepath.Join(dir, "new.txt"), "project", "employee"); got.Ok {
		t.Fatal("create unexpectedly truncated existing file")
	}
}

func TestCrawlerCredentialsStayOutOfArguments(t *testing.T) {
	config := CrawlerConfig{RepoFullName: "permitted/repository", GitHubToken: "dummy-github-secret"}
	cmd, err := cloneCommand(t.Context(), config, t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(strings.Join(cmd.Args, " "), config.GitHubToken) || strings.Contains(strings.Join(cmd.Args, " "), "x-access-token") {
		t.Fatal("credential leaked into command line")
	}
	for _, env := range cmd.Env {
		if strings.HasPrefix(env, "LATTICE_AUTH_TOKEN=") {
			t.Fatal("daemon credential inherited by git")
		}
	}
	for _, repo := range []string{"--upload-pack=bad", "owner/../other", "owner/repo?query", "owner/repo;command"} {
		config.RepoFullName = repo
		if _, err := cloneCommand(t.Context(), config, t.TempDir()); err == nil {
			t.Errorf("accepted invalid repo %q", repo)
		}
	}
}

func TestFileGrantUpdateIsAtomicAndCopiesAuthority(t *testing.T) {
	dir := t.TempDir()
	registry := fsutil.NewRootRegistry()
	defer registry.Close()
	grants := []fsutil.RootGrant{{Path: dir, UserID: "employee", WorkspaceID: "project", ReadOnly: true}}
	if err := registry.UpdateGrants(grants); err != nil {
		t.Fatal(err)
	}
	grants[0].ReadOnly = false
	tel := telemetry.NewManager()
	defer tel.Close()
	file := filepath.Join(dir, "new.txt")
	if got := WriteFileSecure(registry, tel, file, "bad", "project", "employee"); got.Ok {
		t.Fatal("caller mutated an installed grant's authority")
	}
	if err := registry.UpdateGrants([]fsutil.RootGrant{{Path: dir, UserID: "employee", WorkspaceID: "project"}, {Path: filepath.Join(dir, "missing"), UserID: "employee", WorkspaceID: "project"}}); err == nil {
		t.Fatal("invalid grant snapshot accepted")
	}
	if got := WriteFileSecure(registry, tel, file, "bad", "project", "employee"); got.Ok {
		t.Fatal("failed update widened the existing grant")
	}
	if got := ListDirectorySecure(registry, tel, dir, "project", "employee"); !got.Ok {
		t.Fatal("failed update destroyed the existing grant")
	}
}
