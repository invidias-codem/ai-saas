package parity

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/invidias-codem/ai-saas/go-harness/harness"
)

func getFixturesRoot() string {
	if envVal := os.Getenv("LATTICE_FIXTURES_ROOT"); envVal != "" {
		return envVal
	}
	if envVal := os.Getenv("FIXTURES_ROOT"); envVal != "" {
		return envVal
	}

	// Resolve dynamically relative to this test file's location via runtime.Caller(0)
	if _, filename, _, ok := runtime.Caller(0); ok {
		curr := filepath.Dir(filename)
		for {
			target := filepath.Join(curr, ".openclaw", "workspace", "fixtures", "harness")
			if _, err := os.Stat(filepath.Join(target, "manifest.json")); err == nil {
				return target
			}
			parent := filepath.Dir(curr)
			if parent == curr {
				break
			}
			curr = parent
		}
	}

	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	return filepath.Join(home, ".openclaw", "workspace", "fixtures", "harness")
}

func copyDir(src, dst string) error {
	return filepath.Walk(src, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}
		target := filepath.Join(dst, rel)
		if info.IsDir() {
			return os.MkdirAll(target, info.Mode())
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		return os.WriteFile(target, data, info.Mode())
	})
}

func snapshotWorkspace(root string) (map[string]SnapshotEntry, error) {
	snapshot := make(map[string]SnapshotEntry)
	err := filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.IsDir() {
			return nil
		}
		rel, err := filepath.Rel(root, path)
		if err != nil {
			return err
		}
		rel = filepath.ToSlash(rel)
		content, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		snapshot[rel] = SnapshotEntry{
			Exists:  true,
			Content: string(content),
		}
		return nil
	})
	return snapshot, err
}

func getStringInput(inputs map[string]interface{}, key string) string {
	if val, ok := inputs[key]; ok {
		if str, ok := val.(string); ok {
			return str
		}
	}
	return ""
}

func getIntPointerInput(inputs map[string]interface{}, key string) *int {
	if val, ok := inputs[key]; ok {
		if f, ok := val.(float64); ok {
			i := int(f)
			return &i
		}
		if i, ok := val.(int); ok {
			return &i
		}
	}
	return nil
}

func runSingleOperation(ctx context.Context, h *harness.LocalIOHarness, op string, inputs map[string]interface{}) harness.ToolExecutionResult {
	switch op {
	case "read_file":
		return h.ReadFile(ctx, getStringInput(inputs, "filePath"))
	case "write_file":
		return h.WriteFile(ctx, getStringInput(inputs, "filePath"), getStringInput(inputs, "content"))
	case "patch_file":
		return h.PatchFile(ctx, getStringInput(inputs, "filePath"), getStringInput(inputs, "search_block"), getStringInput(inputs, "replace_block"))
	case "run_command":
		return h.RunCommand(ctx, getStringInput(inputs, "command"), getIntPointerInput(inputs, "timeoutMs"))
	default:
		return harness.ToolExecutionResult{
			Ok:    false,
			Error: fmt.Sprintf("Unsupported fixture operation: %s", op),
			Code:  harness.CodeInternalError,
		}
	}
}

func normalizeResult(raw harness.ToolExecutionResult) NormalizedResult {
	var rawMeta struct {
		IsTruncated bool `json:"isTruncated"`
		IsTimedOut  bool `json:"isTimedOut"`
		Code        *int `json:"code"`
	}
	if len(raw.Data) > 0 {
		_ = json.Unmarshal(raw.Data, &rawMeta)
	}

	limitBytesVal := 524288

	actualCode := &raw.Code
	if raw.Code == "" {
		actualCode = nil
	}

	actualOutput := &raw.Output
	if raw.Output == "" && !raw.Ok {
		actualOutput = nil
	}

	actualError := &raw.Error
	if raw.Error == "" {
		actualError = nil
	}

	return NormalizedResult{
		Ok:     raw.Ok,
		Code:   actualCode,
		Output: actualOutput,
		Error:  actualError,
		Meta: NormalizedMeta{
			Truncated:  &rawMeta.IsTruncated,
			TimedOut:   &rawMeta.IsTimedOut,
			ExitCode:   rawMeta.Code,
			LimitBytes: &limitBytesVal,
		},
	}
}

func compareResult(expected ExpectedResult, actual NormalizedResult, mode ComparisonMode, before, after map[string]SnapshotEntry) []string {
	var diffs []string

	// ok
	if expected.Ok != nil && *expected.Ok != actual.Ok {
		diffs = append(diffs, fmt.Sprintf("ok mismatch: expected=%t actual=%t", *expected.Ok, actual.Ok))
	}

	// code
	actualCodeStr := ""
	if actual.Code != nil {
		actualCodeStr = *actual.Code
	}
	expectedCodeStr := ""
	if expected.Code != nil {
		expectedCodeStr = *expected.Code
	}
	if expected.Code != nil || expected.Ok != nil {
		if expectedCodeStr != actualCodeStr {
			diffs = append(diffs, fmt.Sprintf("code mismatch: expected=%q actual=%q", expectedCodeStr, actualCodeStr))
		}
	}

	// output
	if expected.Output != nil {
		actualOutputStr := ""
		if actual.Output != nil {
			actualOutputStr = *actual.Output
		}

		if expected.Output.Equals != nil && *expected.Output.Equals != actualOutputStr {
			diffs = append(diffs, fmt.Sprintf("output equals mismatch:\nexpected: %q\nactual:   %q", *expected.Output.Equals, actualOutputStr))
		}

		for _, sub := range expected.Output.Contains {
			if !strings.Contains(actualOutputStr, sub) {
				diffs = append(diffs, fmt.Sprintf("output missing expected substring: %q", sub))
			}
		}

		for _, sub := range expected.Output.NotContains {
			if strings.Contains(actualOutputStr, sub) {
				diffs = append(diffs, fmt.Sprintf("output unexpectedly contains substring: %q", sub))
			}
		}

		if expected.Output.Length != nil {
			length := len(actualOutputStr)
			if expected.Output.Length.Equals != nil && *expected.Output.Length.Equals != length {
				diffs = append(diffs, fmt.Sprintf("output length %d != expected %d", length, *expected.Output.Length.Equals))
			}
			if expected.Output.Length.Min != nil && length < *expected.Output.Length.Min {
				diffs = append(diffs, fmt.Sprintf("output length %d < expected min %d", length, *expected.Output.Length.Min))
			}
			if expected.Output.Length.Max != nil && length > *expected.Output.Length.Max {
				diffs = append(diffs, fmt.Sprintf("output length %d > expected max %d", length, *expected.Output.Length.Max))
			}
		}
	}

	// error
	if expected.Error != nil {
		actualErrorStr := ""
		if actual.Error != nil {
			actualErrorStr = *actual.Error
		}

		if expected.Error.Equals != nil && *expected.Error.Equals != actualErrorStr {
			diffs = append(diffs, fmt.Sprintf("error equals mismatch: expected=%q actual=%q", *expected.Error.Equals, actualErrorStr))
		}

		for _, sub := range expected.Error.Contains {
			if !strings.Contains(actualErrorStr, sub) {
				diffs = append(diffs, fmt.Sprintf("error missing expected substring: %q", sub))
			}
		}

		for _, sub := range expected.Error.NotContains {
			if strings.Contains(actualErrorStr, sub) {
				diffs = append(diffs, fmt.Sprintf("error unexpectedly contains substring: %q", sub))
			}
		}
	}

	// meta
	if expected.Meta != nil {
		if expected.Meta.Truncated != nil {
			if actual.Meta.Truncated == nil || *actual.Meta.Truncated != *expected.Meta.Truncated {
				diffs = append(diffs, fmt.Sprintf("meta.truncated mismatch: expected=%v actual=%v", *expected.Meta.Truncated, actual.Meta.Truncated))
			}
		}
		if expected.Meta.TimedOut != nil {
			if actual.Meta.TimedOut == nil || *actual.Meta.TimedOut != *expected.Meta.TimedOut {
				diffs = append(diffs, fmt.Sprintf("meta.timedOut mismatch: expected=%v actual=%v", *expected.Meta.TimedOut, actual.Meta.TimedOut))
			}
		}
		if expected.Meta.ExitCode != nil {
			if actual.Meta.ExitCode == nil || *actual.Meta.ExitCode != *expected.Meta.ExitCode {
				diffs = append(diffs, fmt.Sprintf("meta.exitCode mismatch: expected=%v actual=%v", *expected.Meta.ExitCode, actual.Meta.ExitCode))
			}
		}
		if expected.Meta.Signal != nil {
			if actual.Meta.Signal == nil || *actual.Meta.Signal != *expected.Meta.Signal {
				diffs = append(diffs, fmt.Sprintf("meta.signal mismatch: expected=%v actual=%v", *expected.Meta.Signal, actual.Meta.Signal))
			}
		}
		if expected.Meta.LimitBytes != nil {
			if actual.Meta.LimitBytes == nil || *actual.Meta.LimitBytes != *expected.Meta.LimitBytes {
				diffs = append(diffs, fmt.Sprintf("meta.limitBytes mismatch: expected=%v actual=%v", *expected.Meta.LimitBytes, actual.Meta.LimitBytes))
			}
		}
	}

	// files
	if expected.Files != nil {
		if expected.Files.Exists != nil {
			for _, rel := range expected.Files.Exists {
				if _, ok := after[rel]; !ok {
					diffs = append(diffs, fmt.Sprintf("expected file to exist: %q", rel))
				}
			}
		}

		if expected.Files.NotExists != nil {
			for _, rel := range expected.Files.NotExists {
				if _, ok := after[rel]; ok {
					diffs = append(diffs, fmt.Sprintf("expected file not to exist: %q", rel))
				}
			}
		}

		if expected.Files.ContentEquals != nil {
			for rel, content := range expected.Files.ContentEquals {
				if actualFile, ok := after[rel]; !ok {
					diffs = append(diffs, fmt.Sprintf("expected file %q missing for contentEquals", rel))
				} else if actualFile.Content != content {
					diffs = append(diffs, fmt.Sprintf("file content mismatch for %q:\nexpected: %q\nactual:   %q", rel, content, actualFile.Content))
				}
			}
		}

		if expected.Files.ContentContains != nil {
			for rel, subs := range expected.Files.ContentContains {
				if actualFile, ok := after[rel]; !ok {
					diffs = append(diffs, fmt.Sprintf("expected file %q missing for contentContains", rel))
				} else {
					for _, sub := range subs {
						if !strings.Contains(actualFile.Content, sub) {
							diffs = append(diffs, fmt.Sprintf("file %q missing expected content substring: %q", rel, sub))
						}
					}
				}
			}
		}

		if expected.Files.ContentNotContains != nil {
			for rel, subs := range expected.Files.ContentNotContains {
				if actualFile, ok := after[rel]; !ok {
					diffs = append(diffs, fmt.Sprintf("expected file %q missing for contentNotContains", rel))
				} else {
					for _, sub := range subs {
						if strings.Contains(actualFile.Content, sub) {
							diffs = append(diffs, fmt.Sprintf("file %q unexpectedly contains content substring: %q", rel, sub))
						}
					}
				}
			}
		}

		if expected.Files.Changed != nil {
			for _, rel := range expected.Files.Changed {
				beforeVal, beforeExists := before[rel]
				afterVal, afterExists := after[rel]
				changed := !beforeExists || !afterExists || beforeVal.Content != afterVal.Content
				if !changed {
					diffs = append(diffs, fmt.Sprintf("expected file %q to change, but it remained identical", rel))
				}
			}
		}

		if expected.Files.Unchanged != nil {
			for _, rel := range expected.Files.Unchanged {
				beforeVal, beforeExists := before[rel]
				afterVal, afterExists := after[rel]
				unchanged := (beforeExists == afterExists)
				if beforeExists && afterExists {
					unchanged = (beforeVal.Content == afterVal.Content)
				}
				if !unchanged {
					diffs = append(diffs, fmt.Sprintf("expected file %q to remain unchanged, but it was modified", rel))
				}
			}
		}
	}

	return diffs
}

func TestParityFixtures(t *testing.T) {
	fixturesRoot := getFixturesRoot()
	manifestPath := filepath.Join(fixturesRoot, "manifest.json")

	t.Logf("Loading parity golden manifest from: %s", manifestPath)

	data, err := os.ReadFile(manifestPath)
	if err != nil {
		t.Fatalf("Failed to read manifest.json: %v", err)
	}

	var manifest FixtureManifest
	if err := json.Unmarshal(data, &manifest); err != nil {
		t.Fatalf("Failed to parse manifest.json: %v", err)
	}

	_, filename, _, _ := runtime.Caller(0)
	parityDir := filepath.Dir(filename)

	var passedCount, failedCount int

	for _, entry := range manifest.Fixtures {
		t.Run(entry.ID, func(t *testing.T) {
			fixtureDir := filepath.Join(fixturesRoot, entry.Path)
			fixturePath := filepath.Join(fixtureDir, "fixture.json")
			expectedPath := filepath.Join(fixtureDir, "expected.json")

			// Load fixture config
			fixtureData, err := os.ReadFile(fixturePath)
			if err != nil {
				t.Fatalf("Failed to read fixture.json: %v", err)
			}
			var fixture FixtureFile
			if err := json.Unmarshal(fixtureData, &fixture); err != nil {
				t.Fatalf("Failed to parse fixture.json: %v", err)
			}

			// Load expected results
			expectedData, err := os.ReadFile(expectedPath)
			if err != nil {
				t.Fatalf("Failed to read expected.json: %v", err)
			}
			var expected ExpectedResult
			if err := json.Unmarshal(expectedData, &expected); err != nil {
				t.Fatalf("Failed to parse expected.json: %v", err)
			}

			// Materialize isolated temp workspace in the Go project workspace
			tempWorkspace, err := os.MkdirTemp(parityDir, "temp_ws_*")
			if err != nil {
				t.Fatalf("Failed to create temp workspace: %v", err)
			}
			defer os.RemoveAll(tempWorkspace)

			seedDir := filepath.Join(fixtureDir, "workspace")
			if stat, err := os.Stat(seedDir); err == nil && stat.IsDir() {
				if err := copyDir(seedDir, tempWorkspace); err != nil {
					t.Fatalf("Failed to seed workspace: %v", err)
				}
			}

			// Snapshot BEFORE execution
			before, err := snapshotWorkspace(tempWorkspace)
			if err != nil {
				t.Fatalf("Failed to snapshot workspace before: %v", err)
			}

			// Boot secure local harness
			h, err := harness.NewLocalIOHarness(tempWorkspace)
			if err != nil {
				t.Fatalf("Failed to construct LocalIOHarness: %v", err)
			}
			defer h.Close()

			ctx := context.Background()
			startTime := time.Now()

			var rawResult harness.ToolExecutionResult
			if fixture.Operation == "compound" {
				for _, step := range fixture.Steps {
					rawResult = runSingleOperation(ctx, h, step.Operation, step.Inputs)
				}
			} else {
				rawResult = runSingleOperation(ctx, h, fixture.Operation, fixture.Inputs)
			}

			duration := time.Since(startTime)

			// Snapshot AFTER execution
			after, err := snapshotWorkspace(tempWorkspace)
			if err != nil {
				t.Fatalf("Failed to snapshot workspace after: %v", err)
			}

			// Normalize and assert
			normalized := normalizeResult(rawResult)
			diffs := compareResult(expected, normalized, fixture.ComparisonMode, before, after)

			// Check wall clock timing constraints if defined
			if fixture.Timing != nil && fixture.Timing.MaxWallClockMs > 0 {
				durationMs := int(duration.Milliseconds())
				if durationMs > fixture.Timing.MaxWallClockMs {
					diffs = append(diffs, fmt.Sprintf("duration %dms exceeded maxWallClockMs %dms", durationMs, fixture.Timing.MaxWallClockMs))
				}
			}

			if len(diffs) > 0 {
				failedCount++
				t.Errorf("Parity validation failed for %s:\n%s", fixture.ID, strings.Join(diffs, "\n"))
				t.Logf("Raw Result Output: %q", rawResult.Output)
				t.Logf("Raw Result Error: %q", rawResult.Error)
				t.Logf("Raw Result Code: %q", rawResult.Code)
			} else {
				passedCount++
				t.Logf("PASS %s", fixture.ID)
			}
		})
	}

	t.Logf("\nParity Summary: %d passed, %d failed, total %d", passedCount, failedCount, passedCount+failedCount)
}
