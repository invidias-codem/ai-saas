package nativeprotocol

import (
	"context"
	"fmt"
	"github.com/invidias-codem/ai-saas/go-harness/internal/fsutil"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func mutationSession(t *testing.T, writable bool) (*Session, Authority, string, string) {
	t.Helper()
	dir := t.TempDir()
	s := NewSession()
	t.Cleanup(func() {
		if err := s.Close(); err != nil {
			t.Error(err)
		}
	})
	a := Authority{PrincipalID: "local-user-" + strings.Repeat("a", 32), WorkspaceID: "local-workspace-" + strings.Repeat("b", 32), Generation: strings.Repeat("c", 32), PolicyRevision: 1}
	s.Negotiate()
	if code := s.Bind(Binding{Version, a}); code != "" {
		t.Fatal(code)
	}
	root, err := os.OpenRoot(dir)
	if err != nil {
		t.Fatal(err)
	}
	id, err := fsutil.ReadDirectoryIdentity(root)
	_ = root.Close()
	if err != nil {
		t.Fatal(err)
	}
	grant := "local-grant-" + strings.Repeat("d", 32)
	if _, code := s.UpdateGrants(&a, GrantSnapshot{NextRevision: 1, Grants: []fsutil.ReadGrant{{ID: grant, Path: dir, Identity: id, Writable: writable}}}); code != "" {
		t.Fatal(code)
	}
	a.GrantRevision = 1
	return s, a, grant, dir
}
func prepareMutation(t *testing.T, s *Session, a Authority, grant, path string, id int) PreparedMutation {
	t.Helper()
	content := "exact bytes"
	p, code := s.PrepareMutation(&a, PrepareMutationRequest{ProposalID: fmt.Sprintf("local-proposal-%032x", id), Operation: ProposalOperation{Kind: "create_file", GrantID: grant, RelativePath: path, Content: &content}})
	if code != "" {
		t.Fatal(code)
	}
	return p
}
func awaitMutation(t *testing.T, s *Session, a Authority, id string) OperationStatus {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		got, code := s.MutationStatus(&a, OperationReference{id})
		if code != "" {
			t.Fatal(code)
		}
		if got.Status != "running" {
			return got
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatal("owned operation did not finish")
	return OperationStatus{}
}
func TestMutationRecordsAdmissionOnceAndRetainsReplayProtection(t *testing.T) {
	s, a, grant, dir := mutationSession(t, true)
	p := prepareMutation(t, s, a, grant, "new.txt", 1)
	var admitted atomic.Int32
	var wg sync.WaitGroup
	for range 8 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, code := s.DispatchMutation(&a, DispatchMutationRequest{p.Material.ProposalID, p.Digest}); code == "" {
				admitted.Add(1)
			}
		}()
	}
	wg.Wait()
	if admitted.Load() != 1 {
		t.Fatal("duplicate dispatch")
	}
	got := awaitMutation(t, s, a, p.Material.ProposalID)
	if got.Status != "succeeded" || !got.MayHaveChanged {
		t.Fatal(got)
	}
	data, err := os.ReadFile(filepath.Join(dir, "new.txt"))
	if err != nil || string(data) != "exact bytes" {
		t.Fatal("wrong effect", err)
	}
	if _, code := s.DispatchMutation(&a, DispatchMutationRequest{p.Material.ProposalID, p.Digest}); code != "LOCAL_OPERATION_REPLAYED" {
		t.Fatal(code)
	}
	if got, code := s.CancelMutation(&a, OperationReference{p.Material.ProposalID}); code != "" || got.Status != "succeeded" {
		t.Fatal("cancel claimed reversal", code)
	}
}
func TestReadonlyChangedDigestStaleAuthorityAndExpiryHaveNoEffects(t *testing.T) {
	s, a, g, dir := mutationSession(t, false)
	p := prepareMutation(t, s, a, g, "absent", 1)
	if _, code := s.DispatchMutation(&a, DispatchMutationRequest{p.Material.ProposalID, p.Digest}); code != "LOCAL_WRITE_GRANT_REQUIRED" {
		t.Fatal(code)
	}
	if _, err := os.Stat(filepath.Join(dir, "absent")); !os.IsNotExist(err) {
		t.Fatal("read-only effect")
	}
	rw, b, g, dir := mutationSession(t, true)
	q := prepareMutation(t, rw, b, g, "absent", 2)
	if _, code := rw.DispatchMutation(&b, DispatchMutationRequest{q.Material.ProposalID, strings.Repeat("0", 64)}); code != "LOCAL_REVIEW_DENIED" {
		t.Fatal(code)
	}
	stale := b
	stale.GrantRevision--
	if _, code := rw.DispatchMutation(&stale, DispatchMutationRequest{q.Material.ProposalID, q.Digest}); code != "LOCAL_AUTHORITY_MISMATCH" {
		t.Fatal(code)
	}
	rw.now = func() time.Time { return time.Now().Add(mutationLifetime) }
	if _, code := rw.DispatchMutation(&b, DispatchMutationRequest{q.Material.ProposalID, q.Digest}); code != "LOCAL_REVIEW_DENIED" {
		t.Fatal(code)
	}
	if _, err := os.Stat(filepath.Join(dir, "absent")); !os.IsNotExist(err) {
		t.Fatal("denied effect")
	}
}
func TestOwnedCancellationAndRevocationWaitForAdmittedMutation(t *testing.T) {
	s, a, g, _ := mutationSession(t, true)
	p := prepareMutation(t, s, a, g, "absent", 1)
	entered := make(chan struct{})
	release := make(chan struct{})
	s.apply = func(ctx context.Context, _, _, _, _, _, _ string, _ fsutil.FilePrecondition) fsutil.MutationResult {
		close(entered)
		<-ctx.Done()
		<-release
		return fsutil.MutationResult{Code: "LOCAL_OPERATION_CANCELLED"}
	}
	if _, code := s.DispatchMutation(&a, DispatchMutationRequest{p.Material.ProposalID, p.Digest}); code != "" {
		t.Fatal(code)
	}
	<-entered
	if got, code := s.CancelMutation(&a, OperationReference{p.Material.ProposalID}); code != "" || got.Status != "running" {
		t.Fatal("cancellation promised completion")
	}
	revoked := make(chan string, 1)
	go func() {
		_, code := s.UpdateGrants(&a, GrantSnapshot{NextRevision: 2, Grants: []fsutil.ReadGrant{}})
		revoked <- code
	}()
	select {
	case <-revoked:
		t.Fatal("revocation skipped admitted work")
	case <-time.After(30 * time.Millisecond):
	}
	close(release)
	if code := <-revoked; code != "" {
		t.Fatal(code)
	}
	a.GrantRevision = 2
	got := awaitMutation(t, s, a, p.Material.ProposalID)
	if got.Status != "cancelled" || got.MayHaveChanged {
		t.Fatal(got)
	}
}
func TestPreparedInputsAreCopiedAndCapacityNeverEvictsAttempts(t *testing.T) {
	s, a, g, dir := mutationSession(t, true)
	p := prepareMutation(t, s, a, g, "exact", 1)
	*p.Material.Operation.Content = "changed"
	p.Material.Precondition.ParentIdentity.File = "wrong"
	if _, code := s.DispatchMutation(&a, DispatchMutationRequest{p.Material.ProposalID, p.Digest}); code != "" {
		t.Fatal(code)
	}
	if got := awaitMutation(t, s, a, p.Material.ProposalID); got.Status != "succeeded" {
		t.Fatal(got)
	}
	data, _ := os.ReadFile(filepath.Join(dir, "exact"))
	if string(data) != "exact bytes" {
		t.Fatal("returned pointers changed prepared intent")
	}
	s.operations.mu.Lock()
	for i := 2; i <= maxMutationAttempts; i++ {
		s.operations.attempts[fmt.Sprintf("local-proposal-%032x", i)] = &mutationAttempt{authority: a}
	}
	s.operations.mu.Unlock()
	content := "x"
	if _, code := s.PrepareMutation(&a, PrepareMutationRequest{ProposalID: fmt.Sprintf("local-proposal-%032x", maxMutationAttempts+1), Operation: ProposalOperation{Kind: "create_file", GrantID: g, RelativePath: "later", Content: &content}}); code != "LOCAL_PROPOSAL_CAPACITY" {
		t.Fatal(code)
	}
	if _, code := s.DispatchMutation(&a, DispatchMutationRequest{p.Material.ProposalID, p.Digest}); code != "LOCAL_OPERATION_REPLAYED" {
		t.Fatal(code)
	}
}
func TestPendingBoundAndObservedUnknownAreNotRetried(t *testing.T) {
	s, a, g, _ := mutationSession(t, true)
	first := prepareMutation(t, s, a, g, "first", 1)
	for i := 2; i <= maxPreparedMutations; i++ {
		prepareMutation(t, s, a, g, fmt.Sprintf("file%d", i), i)
	}
	content := "x"
	req := PrepareMutationRequest{ProposalID: fmt.Sprintf("local-proposal-%032x", 33), Operation: ProposalOperation{Kind: "create_file", GrantID: g, RelativePath: "next", Content: &content}}
	if _, code := s.PrepareMutation(&a, req); code != "LOCAL_PROPOSAL_CAPACITY" {
		t.Fatal(code)
	}
	if _, code := s.CancelMutation(&a, OperationReference{first.Material.ProposalID}); code != "" {
		t.Fatal(code)
	}
	p, code := s.PrepareMutation(&a, req)
	if code != "" {
		t.Fatal(code)
	}
	var calls atomic.Int32
	s.apply = func(context.Context, string, string, string, string, string, string, fsutil.FilePrecondition) fsutil.MutationResult {
		calls.Add(1)
		return fsutil.MutationResult{Code: "LOCAL_OUTCOME_UNKNOWN", MayHaveChanged: true}
	}
	if _, code = s.DispatchMutation(&a, DispatchMutationRequest{p.Material.ProposalID, p.Digest}); code != "" {
		t.Fatal(code)
	}
	if got := awaitMutation(t, s, a, p.Material.ProposalID); got.Status != "outcome_unknown" || !got.MayHaveChanged {
		t.Fatal(got)
	}
	for range 3 {
		if _, code = s.DispatchMutation(&a, DispatchMutationRequest{p.Material.ProposalID, p.Digest}); code != "LOCAL_OPERATION_REPLAYED" {
			t.Fatal(code)
		}
	}
	if calls.Load() != 1 {
		t.Fatal("unknown outcome replayed")
	}
}
