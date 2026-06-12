package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/invidias-codem/ai-saas/go-harness/harness"
	"github.com/invidias-codem/ai-saas/go-harness/internal/fsutil"
	"github.com/invidias-codem/ai-saas/go-harness/internal/telemetry"
)

func TestSecureCapabilities(t *testing.T) {
	// 1. Initialize the decoupled SessionContext
	telemetryManager := telemetry.NewManager() // Flusher is OFF
	rootRegistry := fsutil.NewRootRegistry()
	session := &SessionContext{
		Registry:  rootRegistry,
		Telemetry: telemetryManager,
	}

	// 2. Setup a temporary safe directory and file for testing
	safeDir := t.TempDir()
	safeFile := filepath.Join(safeDir, "test_authorized.txt")
	err := os.WriteFile(safeFile, []byte("Lattice secure read successful"), 0644)
	if err != nil {
		t.Fatalf("Failed to create safe file: %v", err)
	}

	// CHECKLIST ITEM 1: Granted root stored and reloaded correctly (Hydration)
	grants := []fsutil.RootGrant{
		{ID: "grant_1", Path: safeDir, Label: "Test Root", ReadOnly: true},
		{ID: "grant_2", Path: safeDir, Label: "Mutable Root", ReadOnly: false, AllowDestructive: false},
	}
	session.Registry.UpdateGrants(grants)
	
	// Ensure the internal state correctly accepted the grant
	matchedGrant, _ := session.Registry.GetMatchingGrant(safeFile)
	if matchedGrant == nil || matchedGrant.ID != "grant_1" {
		t.Fatalf("Registry failed to store or reload root grant")
	}

	// --- SUCCESSFUL CAPABILITIES (INSIDE GRANTS) ---
	
	// CHECKLIST ITEM 3: read_file works inside granted root
	resSafeRead := harness.ReadFileSecure(session.Registry, session.Telemetry, safeFile, "ws_1", "usr_1")
	if !resSafeRead.Ok || !strings.Contains(resSafeRead.Output, "Lattice secure read successful") {
		t.Fatalf("Expected read_file success for safe file, got: %v", resSafeRead.Error)
	}

	// CHECKLIST ITEM 2: list_directory works inside granted root
	resSafeList := harness.ListDirectorySecure(session.Registry, session.Telemetry, safeDir, "ws_1", "usr_1")
	if !resSafeList.Ok || !strings.Contains(resSafeList.Output, "test_authorized.txt") {
		t.Fatalf("Expected list_directory success for safe directory, got: %v", resSafeList.Error)
	}

	// CHECKLIST ITEM 4: stat_path works inside granted root
	resSafeStat := harness.StatPathSecure(session.Registry, session.Telemetry, safeFile, "ws_1", "usr_1")
	if !resSafeStat.Ok || !strings.Contains(resSafeStat.Output, "test_authorized.txt") {
		t.Fatalf("Expected stat_path success for safe file, got: %v", resSafeStat.Error)
	}

	// --- DENIED CAPABILITIES (OUT OF BOUNDS) ---

	// CHECKLIST ITEM 5: out-of-root path denied
	resDeniedRead := harness.ReadFileSecure(session.Registry, session.Telemetry, "/etc/passwd", "ws_1", "usr_1")
	if resDeniedRead.Ok || !strings.Contains(resDeniedRead.Error, "Forbidden") {
		t.Fatalf("CRITICAL: Out of root path read was NOT denied! Result: %v", resDeniedRead.Output)
	}
	
	resDeniedList := harness.ListDirectorySecure(session.Registry, session.Telemetry, "/etc", "ws_1", "usr_1")
	if resDeniedList.Ok || !strings.Contains(resDeniedList.Error, "Forbidden") {
		t.Fatalf("CRITICAL: Out of root path list was NOT denied!")
	}

	// CHECKLIST ITEM 6: traversal denied
	traversalPath := filepath.Join(safeDir, "../../../etc/passwd")
	resTraversalRead := harness.ReadFileSecure(session.Registry, session.Telemetry, traversalPath, "ws_1", "usr_1")
	if resTraversalRead.Ok || !strings.Contains(resTraversalRead.Error, "Forbidden") {
		t.Fatalf("CRITICAL: Path traversal read was NOT denied!")
	}

	// --- CHECKLIST ITEM 9: no mutation capability exposed ---
	// Phase 1 assertion: There is no WriteFileSecure intentionally exposed or wired in local_capabilities.go for root grants.
	// Phase 2 assertion: Mutation is rejected on ReadOnly root.
	readOnlyPath := filepath.Join(safeDir, "test_authorized.txt")
	// Temporarily switch registry to ReadOnly for testing
	session.Registry.UpdateGrants([]fsutil.RootGrant{
		{ID: "grant_1", Path: safeDir, Label: "Test Root", ReadOnly: true},
	})
	resDeniedWrite := harness.WriteFileSecure(session.Registry, session.Telemetry, readOnlyPath, "Should fail", "ws_1", "usr_1")
	if resDeniedWrite.Ok || !strings.Contains(resDeniedWrite.Error, "Read-Only") {
		t.Fatalf("CRITICAL: Write to Read-Only root was NOT denied!")
	}

	// --- MUTATION FLOW (PHASE 2) ---
	// Switch registry to Mutable but NOT Destructive
	session.Registry.UpdateGrants([]fsutil.RootGrant{
		{ID: "grant_2", Path: safeDir, Label: "Mutable Root", ReadOnly: false, AllowDestructive: false},
	})

	mutFile := filepath.Join(safeDir, "mut_test.txt")
	resCreate := harness.CreateFileSecure(session.Registry, session.Telemetry, mutFile, "ws_1", "usr_1")
	if !resCreate.Ok {
		t.Fatalf("Failed to create file in mutable root: %v", resCreate.Error)
	}

	resWrite := harness.WriteFileSecure(session.Registry, session.Telemetry, mutFile, "Hello World", "ws_1", "usr_1")
	if !resWrite.Ok {
		t.Fatalf("Failed to write file in mutable root: %v", resWrite.Error)
	}

	mutDir := filepath.Join(safeDir, "mut_dir")
	resMkdir := harness.CreateDirectorySecure(session.Registry, session.Telemetry, mutDir, "ws_1", "usr_1")
	if !resMkdir.Ok {
		t.Fatalf("Failed to create directory in mutable root: %v", resMkdir.Error)
	}

	movedFile := filepath.Join(mutDir, "mut_test.txt")
	resMove := harness.MovePathSecure(session.Registry, session.Telemetry, mutFile, movedFile, "ws_1", "usr_1")
	if !resMove.Ok {
		t.Fatalf("Failed to move file within mutable root: %v", resMove.Error)
	}

	// Test Destructive Action Denied
	resDeleteDenied := harness.DeletePathSecure(session.Registry, session.Telemetry, movedFile, "ws_1", "usr_1")
	if resDeleteDenied.Ok || !strings.Contains(resDeleteDenied.Error, "Destructive") {
		t.Fatalf("CRITICAL: Delete was NOT denied when AllowDestructive=false!")
	}

	// Enable Destructive
	session.Registry.UpdateGrants([]fsutil.RootGrant{
		{ID: "grant_3", Path: safeDir, Label: "Destructive Root", ReadOnly: false, AllowDestructive: true},
	})

	resDelete := harness.DeletePathSecure(session.Registry, session.Telemetry, movedFile, "ws_1", "usr_1")
	if !resDelete.Ok {
		t.Fatalf("Failed to delete file with AllowDestructive=true: %v", resDelete.Error)
	}

	// --- INTELLIGENCE INTAKE FLOW (PHASE 3A) ---
	// 1. Setup repo mock structure
	repoDir := filepath.Join(safeDir, "test_repo")
	os.MkdirAll(repoDir, 0755)
	os.MkdirAll(filepath.Join(repoDir, ".git"), 0755) // Should be excluded
	os.WriteFile(filepath.Join(repoDir, ".git", "config"), []byte("..."), 0644)
	os.WriteFile(filepath.Join(repoDir, "package.json"), []byte("{}"), 0644)
	os.WriteFile(filepath.Join(repoDir, "index.ts"), []byte("console.log('hi');"), 0644)
	
	largePdfPath := filepath.Join(repoDir, "manual.pdf")
	os.WriteFile(largePdfPath, make([]byte, 1024), 0644) // Unsupported
	
	hugeTextPath := filepath.Join(repoDir, "huge.txt")
	os.WriteFile(hugeTextPath, make([]byte, 200*1024), 0644) // 200KB (Over 100KB limit)

	// 2. Discover Documents
	resDiscover := harness.DiscoverDocumentsSecure(session.Registry, session.Telemetry, repoDir, "ws_1", "usr_1")
	if !resDiscover.Ok || !strings.Contains(resDiscover.Output, "index.ts") || strings.Contains(resDiscover.Output, ".git") {
		t.Fatalf("DiscoverDocumentsSecure failed or included excluded directories/files: %v", resDiscover.Error)
	}

	// 3. Extract Text (Valid)
	resExtract := harness.ExtractTextSecure(session.Registry, session.Telemetry, filepath.Join(repoDir, "index.ts"), "ws_1", "usr_1")
	if !resExtract.Ok || !strings.Contains(resExtract.Output, "console.log") {
		t.Fatalf("ExtractTextSecure failed on valid file: %v", resExtract.Error)
	}

	// 4. Extract Text (Unsupported extension)
	resExtractPdf := harness.ExtractTextSecure(session.Registry, session.Telemetry, largePdfPath, "ws_1", "usr_1")
	if resExtractPdf.Ok || !strings.Contains(resExtractPdf.Error, "Unsupported file type") {
		t.Fatalf("ExtractTextSecure did not reject PDF file properly: %v", resExtractPdf.Output)
	}

	// 5. Extract Text (Size Limit)
	resExtractHuge := harness.ExtractTextSecure(session.Registry, session.Telemetry, hugeTextPath, "ws_1", "usr_1")
	if resExtractHuge.Ok || !strings.Contains(resExtractHuge.Error, "too large") {
		t.Fatalf("ExtractTextSecure did not reject 200KB file properly: %v", resExtractHuge.Output)
	}

	// 6. Repo Summary
	resSummary := harness.SummarizeRepoSecure(session.Registry, session.Telemetry, repoDir, "ws_1", "usr_1")
	if !resSummary.Ok || !strings.Contains(resSummary.Output, "package.json") {
		t.Fatalf("SummarizeRepoSecure failed to identify repo structure: %v", resSummary.Error)
	}

	// --- CHECKLIST ITEM 7 & 8: Telemetry Proof Path ---
	events := session.Telemetry.GetBufferedEvents()
	if len(events) == 0 {
		t.Fatalf("CRITICAL: No telemetry events were recorded in the buffer!")
	}

	// We expect multiple events including successes and denials from both Phase 1 and Phase 2 tests
	if len(events) == 0 {
		t.Fatalf("CRITICAL: No telemetry events were recorded in the buffer!")
	}

	var foundTraversalDenial, foundMutationDenial, foundDestructiveDenial bool
	for _, e := range events {
		if e.EventType == telemetry.EventRootAccessDenied && strings.Contains(e.PathAccessed, "etc/passwd") {
			foundTraversalDenial = true
		}
		if e.EventType == telemetry.EventMutationDenied && strings.Contains(e.PathAccessed, "test_authorized.txt") {
			foundMutationDenial = true
		}
		if e.EventType == telemetry.EventDestructiveActionDenied {
			foundDestructiveDenial = true
		}
		// Verify duration latency was tracked
		if e.DurationMs < 0 {
			t.Errorf("Telemetry event recorded negative duration")
		}
	}

	if !foundTraversalDenial {
		t.Fatalf("CRITICAL: The path traversal denial was NOT emitted to the telemetry buffer!")
	}
	if !foundMutationDenial {
		t.Fatalf("CRITICAL: The Read-Only mutation denial was NOT emitted to the telemetry buffer!")
	}
	if !foundDestructiveDenial {
		t.Fatalf("CRITICAL: The Destructive action denial was NOT emitted to the telemetry buffer!")
	}
}
