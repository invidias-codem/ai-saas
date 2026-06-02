package harness

import (
	"os"
	"strings"
	"testing"

	"github.com/invidias-codem/ai-saas/go-harness/internal/fsutil"
	"github.com/invidias-codem/ai-saas/go-harness/internal/telemetry"
)

func setupExecutionTestEnv(t *testing.T) (*fsutil.RootRegistry, *telemetry.Manager, string) {
	registry := fsutil.NewRootRegistry()
	tempDir := t.TempDir()

	registry.UpdateGrants([]fsutil.RootGrant{
		{
			Path:        tempDir,
			WorkspaceID: "test_workspace_1",
			UserID:      "user_1",
		},
	})

	tel := telemetry.NewManager()
	return registry, tel, tempDir
}

func TestExecuteCommandSecure_Success(t *testing.T) {
	registry, tel, tempDir := setupExecutionTestEnv(t)

	output, err := ExecuteCommandSecure(registry, tel, "echo hello world", tempDir, "test_workspace_1", "user_1", 5)
	if err != nil {
		t.Fatalf("Expected ok, got error: %v", err)
	}
	if !strings.Contains(output, "hello world") {
		t.Errorf("Expected output to contain 'hello world', got: %s", output)
	}
}

func TestExecuteCommandSecure_Timeout(t *testing.T) {
	registry, tel, tempDir := setupExecutionTestEnv(t)

	// A command that will hang
	_, err := ExecuteCommandSecure(registry, tel, "sleep 10", tempDir, "test_workspace_1", "user_1", 1)
	if err == nil {
		t.Fatal("Expected failure due to timeout, got success")
	}
	if !strings.Contains(err.Error(), "Timeout") {
		t.Errorf("Expected timeout error, got %v", err)
	}
}

func TestExecuteCommandSecure_Truncation(t *testing.T) {
	registry, tel, tempDir := setupExecutionTestEnv(t)

	// Create a large file
	largeContent := strings.Repeat("A", 15000)
	testFile := tempDir + "/large.txt"
	os.WriteFile(testFile, []byte(largeContent), 0644)

	output, _ := ExecuteCommandSecure(registry, tel, "cat large.txt", tempDir, "test_workspace_1", "user_1", 5)
	
	// The length should be strictly controlled (Head + Tail + Truncation Message length)
	if !strings.Contains(output, "[OUTPUT TRUNCATED") {
		t.Errorf("Expected output to be truncated. Output was %d bytes long. Output: %s", len(output), output)
	}
	// Approximate check for length limit
	if len(output) > 12000 {
		t.Errorf("Expected output to be bounded near 10KB, got %d bytes", len(output))
	}
}

func TestExecuteCommandSecure_ShellInjectionPrevention(t *testing.T) {
	registry, tel, tempDir := setupExecutionTestEnv(t)

	// Since we execute directly and don't pass to bash -c, this should fail because
	// `echo` doesn't interpret `&& ls` as separate commands but as literal strings.
	output, _ := ExecuteCommandSecure(registry, tel, "echo hello && ls", tempDir, "test_workspace_1", "user_1", 5)
	
	// Even if it succeeds printing, it should print "hello && ls" literally, not list the directory.
	if !strings.Contains(output, "&& ls") {
		t.Errorf("Expected && to be treated as a literal argument, but it wasn't. Output: %s", output)
	}
}
