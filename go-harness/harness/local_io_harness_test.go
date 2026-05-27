package harness

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLocalIOHarness_Init(t *testing.T) {
	// Missing workspace should fail to initialize
	_, err := NewLocalIOHarness("non_existent_folder_xyz_123")
	if err == nil {
		t.Errorf("expected initialization failure for missing workspace root")
	}
}

func TestLocalIOHarness_FileOperations(t *testing.T) {
	ctx := context.Background()

	// Create temp directory for testing workspace root
	tempDir, err := os.MkdirTemp("", "harness-test-workspace-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	h, err := NewLocalIOHarness(tempDir)
	if err != nil {
		t.Fatalf("failed to create LocalIOHarness: %v", err)
	}
	defer h.Close()

	// 1. Write nested file (automatic parent creation)
	writeRes := h.WriteFile(ctx, "subfolder/test_file.txt", "hello integration world")
	if !writeRes.Ok {
		t.Fatalf("failed to write nested file: %s", writeRes.Error)
	}

	// 2. Read file back and check content
	readRes := h.ReadFile(ctx, "subfolder/test_file.txt")
	if !readRes.Ok {
		t.Fatalf("failed to read nested file: %s", readRes.Error)
	}
	if readRes.Output != "hello integration world" {
		t.Errorf("expected content %q, got %q", "hello integration world", readRes.Output)
	}

	// 3. Reject reading missing file
	readMissing := h.ReadFile(ctx, "subfolder/missing.txt")
	if readMissing.Ok {
		t.Errorf("expected failure reading missing file")
	}
	if readMissing.Code != CodeFileNotFound {
		t.Errorf("expected error code %s, got %s", CodeFileNotFound, readMissing.Code)
	}

	// 4. Reject traversal escaping workspace root
	readOutside := h.ReadFile(ctx, "../outside.txt")
	if readOutside.Ok {
		t.Errorf("expected failure reading outside workspace")
	}
	if readOutside.Code != CodePathOutsideWorkspace {
		t.Errorf("expected error code %s, got %s", CodePathOutsideWorkspace, readOutside.Code)
	}

	// 5. Allow inner relative traversal
	readNested := h.ReadFile(ctx, "subfolder/inner/../../subfolder/test_file.txt")
	if !readNested.Ok {
		t.Fatalf("failed to read with safe inner relative traversal: %s", readNested.Error)
	}
	if readNested.Output != "hello integration world" {
		t.Errorf("expected content %q, got %q", "hello integration world", readNested.Output)
	}

	// 6. Reject writing outside workspace root
	writeOutside := h.WriteFile(ctx, "../outside.txt", "evil content")
	if writeOutside.Ok {
		t.Errorf("expected failure writing outside workspace")
	}
	if writeOutside.Code != CodePathOutsideWorkspace {
		t.Errorf("expected error code %s, got %s", CodePathOutsideWorkspace, writeOutside.Code)
	}
}

func TestLocalIOHarness_PatchOperations(t *testing.T) {
	ctx := context.Background()

	tempDir, err := os.MkdirTemp("", "harness-test-patch-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	h, err := NewLocalIOHarness(tempDir)
	if err != nil {
		t.Fatalf("failed to create LocalIOHarness: %v", err)
	}
	defer h.Close()

	// Seed test file
	filePath := "patch_test.txt"
	err = os.WriteFile(filepath.Join(tempDir, filePath), []byte("line 1\nTARGET_LINE\nline 3"), 0644)
	if err != nil {
		t.Fatalf("failed to seed test file: %v", err)
	}

	// 1. Success patch
	resPatch := h.PatchFile(ctx, filePath, "TARGET_LINE", "REPLACED_LINE")
	if !resPatch.Ok {
		t.Fatalf("failed to patch: %s", resPatch.Error)
	}
	content, _ := os.ReadFile(filepath.Join(tempDir, filePath))
	if string(content) != "line 1\nREPLACED_LINE\nline 3" {
		t.Errorf("patched content mismatch, got %q", string(content))
	}

	// 2. Reject no match
	resNoMatch := h.PatchFile(ctx, filePath, "MISSING_LINE", "NEW_LINE")
	if resNoMatch.Ok {
		t.Errorf("expected no-match failure")
	}
	if resNoMatch.Code != CodePatchNoMatch {
		t.Errorf("expected error code %s, got %s", CodePatchNoMatch, resNoMatch.Code)
	}

	// 3. Reject multiple matches
	// Seed duplicate line
	err = os.WriteFile(filepath.Join(tempDir, filePath), []byte("TARGET\nTARGET"), 0644)
	if err != nil {
		t.Fatalf("failed to re-seed file: %v", err)
	}
	resMult := h.PatchFile(ctx, filePath, "TARGET", "REPLACED")
	if resMult.Ok {
		t.Errorf("expected multiple matches failure")
	}
	if resMult.Code != CodePatchMultipleMatches {
		t.Errorf("expected error code %s, got %s", CodePatchMultipleMatches, resMult.Code)
	}

	// 4. Reject binary file patch
	binaryPath := "binary.bin"
	err = os.WriteFile(filepath.Join(tempDir, binaryPath), []byte("some \x00 binary \x00 bytes"), 0644)
	if err != nil {
		t.Fatalf("failed to write binary file: %v", err)
	}
	resBin := h.PatchFile(ctx, binaryPath, "binary", "text")
	if resBin.Ok {
		t.Errorf("expected binary rejection failure")
	}
	if resBin.Code != CodeInvalidArgument {
		t.Errorf("expected error code %s, got %s", CodeInvalidArgument, resBin.Code)
	}
}

func TestLocalIOHarness_Commands(t *testing.T) {
	ctx := context.Background()

	tempDir, err := os.MkdirTemp("", "harness-test-command-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	h, err := NewLocalIOHarness(tempDir)
	if err != nil {
		t.Fatalf("failed to create LocalIOHarness: %v", err)
	}
	defer h.Close()

	// 1. Success execution
	res := h.RunCommand(ctx, `echo "hello harness integration test"`, nil)
	if !res.Ok {
		t.Fatalf("command failed: %s", res.Error)
	}
	trimmed := strings.TrimSpace(res.Output)
	if trimmed != "hello harness integration test" {
		t.Errorf("expected output %q, got %q", "hello harness integration test", trimmed)
	}

	// 2. Failure execution (non-existent command)
	resFail := h.RunCommand(ctx, `non_existent_command_xyz_123`, nil)
	if resFail.Ok {
		t.Errorf("expected non-existent command failure")
	}
	if resFail.Code != CodeCommandExitNonZero {
		t.Errorf("expected error code %s, got %s", CodeCommandExitNonZero, resFail.Code)
	}

	// 3. Timeout execution
	shortTimeout := 100
	resTimeout := h.RunCommand(ctx, `sleep 5`, &shortTimeout)
	if resTimeout.Ok {
		t.Errorf("expected command timeout")
	}
	if resTimeout.Code != CodeCommandTimeout {
		t.Errorf("expected error code %s, got %s", CodeCommandTimeout, resTimeout.Code)
	}
}
