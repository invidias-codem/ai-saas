package executil

import (
	"context"
	"strings"
	"testing"
)

func TestRunShellCommand(t *testing.T) {
	ctx := context.Background()

	// 1. Test benign success
	res, err := RunShellCommand(ctx, ".", `echo "hello execution world"`, 5000, 1024)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !res.Ok {
		t.Fatalf("expected command success, error: %s", res.Error)
	}
	trimmedOut := strings.TrimSpace(res.Output)
	if trimmedOut != "hello execution world" {
		t.Errorf("expected output %q, got %q", "hello execution world", trimmedOut)
	}

	// 2. Test timeout
	resTimeout, err := RunShellCommand(ctx, ".", `sleep 2`, 100, 1024)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resTimeout.Ok {
		t.Errorf("expected timeout failure")
	}
	if !resTimeout.TimedOut {
		t.Errorf("expected TimedOut flag to be true")
	}

	// 3. Test truncation
	// Generate output larger than 10 bytes
	resTruncated, err := RunShellCommand(ctx, ".", `echo "this is a very long string that will exceed ten bytes"`, 5000, 10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resTruncated.Ok {
		t.Errorf("expected size truncation failure")
	}
	if !resTruncated.Truncated {
		t.Errorf("expected Truncated flag to be true")
	}
	if !strings.Contains(resTruncated.Output, "[OUTPUT TRUNCATED DUE TO SIZE LIMIT]") {
		t.Errorf("expected output to contain truncation marker, got %q", resTruncated.Output)
	}
}
