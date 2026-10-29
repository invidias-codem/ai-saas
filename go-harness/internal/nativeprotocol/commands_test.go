package nativeprotocol

import (
	"context"
	"fmt"
	"github.com/invidias-codem/ai-saas/go-harness/internal/fsutil"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

type fakeCommandProvider struct {
	calls   atomic.Int32
	run     func(context.Context, commandLaunch) commandResult
	cleanup func(context.Context, string) bool
}

func (p *fakeCommandProvider) Run(ctx context.Context, launch commandLaunch) commandResult {
	p.calls.Add(1)
	if p.run != nil {
		return p.run(ctx, launch)
	}
	return commandResult{Output: "test provider only", CleanupConfirmed: true}
}
func (p *fakeCommandProvider) ConfirmCleanup(ctx context.Context, id string) bool {
	if p.cleanup != nil {
		return p.cleanup(ctx, id)
	}
	return true
}
func qualifyTestProvider(backend *fakeCommandProvider) *qualifiedCommandProvider {
	return &qualifiedCommandProvider{qualification: commandQualification{Binding: ProviderBinding{ID: "test-provider", Revision: 1, Qualification: strings.Repeat("f", 64)}, Platform: runtime.GOOS, Files: true, Network: true, NonElevated: true, Descendants: true, WorkspacePolicy: true, PinnedLaunch: true, CleanEnvironment: true}, backend: backend}
}
func commandFixture(t *testing.T) (*Session, Authority, string, string, string) {
	t.Helper()
	s, a, g, dir := mutationSession(t, true)
	bin := t.TempDir()
	source, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	name := "lattice-command-fixture"
	if runtime.GOOS == "windows" {
		name += ".exe"
	}
	input, err := os.Open(source)
	if err != nil {
		t.Fatal(err)
	}
	defer input.Close()
	output, err := os.OpenFile(filepath.Join(bin, name), os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0700)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := io.Copy(output, input); err != nil {
		t.Fatal(err)
	}
	if err := output.Close(); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", bin)
	return s, a, g, dir, name
}
func prepareTestCommand(t *testing.T, s *Session, a Authority, g, name string, id int) PreparedMutation {
	t.Helper()
	args := []string{"literal;not-shell", "", "资料"}
	p, code := s.PrepareCommand(&a, PrepareMutationRequest{ProposalID: fmt.Sprintf("local-proposal-%032x", id), Operation: ProposalOperation{Kind: "execute_command", GrantID: g, RelativePath: ".", Command: &CommandInput{Shell: "direct", Executable: &name, Argv: &args}}})
	if code != "" {
		t.Fatal(code)
	}
	return p
}
func waitCommand(t *testing.T, s *Session, a Authority, id string, predicate func(OperationStatus) bool) OperationStatus {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		status, code := s.CommandStatus(&a, OperationReference{id})
		if code != "" {
			t.Fatal(code)
		}
		if predicate(status) {
			return status
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatal("owned command did not reach expected state")
	return OperationStatus{}
}
func TestProductionCommandAdmissionHasNoQualifiedProvider(t *testing.T) {
	s, a, g, _, name := commandFixture(t)
	if s.commandProvider != nil {
		t.Fatal("production constructor registered a provider")
	}
	p := prepareTestCommand(t, s, a, g, name, 1)
	pre := p.Material.CommandPrecondition
	if pre.Provider.ID != "unavailable" || !pre.RequiresSandbox || pre.TimeoutMS != 30000 || pre.OutputLimit != 10240 || pre.EnvironmentPolicy != commandEnvironment {
		t.Fatal("effective policy not required")
	}
	status, code := s.DispatchCommand(&a, DispatchMutationRequest{p.Material.ProposalID, p.Digest})
	if code != "" || status.Status != "denied" || status.Code != "LOCAL_SANDBOX_REQUIRED" || status.MayHaveChanged {
		t.Fatal("unqualified dispatch admitted")
	}
	status, code = s.CommandStatus(&a, OperationReference{p.Material.ProposalID})
	if code != "" || status.Code != "LOCAL_SANDBOX_REQUIRED" {
		t.Fatal("denial outcome not retained")
	}
	if _, code = s.DispatchCommand(&a, DispatchMutationRequest{p.Material.ProposalID, p.Digest}); code != "LOCAL_OPERATION_REPLAYED" {
		t.Fatal(code)
	}
	if _, code = s.DispatchMutation(&a, DispatchMutationRequest{p.Material.ProposalID, p.Digest}); code != "LOCAL_OPERATION_REPLAYED" {
		t.Fatal("alternate dispatch bypass")
	}
}
func TestEveryQualificationRequirementIsMandatoryAndChangesRequireReview(t *testing.T) {
	for _, missing := range []string{"files", "network", "non-elevated", "descendants", "policy", "handles", "environment", "revision", "platform"} {
		t.Run(missing, func(t *testing.T) {
			s, a, g, _, name := commandFixture(t)
			backend := &fakeCommandProvider{}
			provider := qualifyTestProvider(backend)
			s.commandProvider = provider
			p := prepareTestCommand(t, s, a, g, name, 1)
			q := &provider.qualification
			switch missing {
			case "files":
				q.Files = false
			case "network":
				q.Network = false
			case "non-elevated":
				q.NonElevated = false
			case "descendants":
				q.Descendants = false
			case "policy":
				q.WorkspacePolicy = false
			case "handles":
				q.PinnedLaunch = false
			case "environment":
				q.CleanEnvironment = false
			case "revision":
				q.Binding.Revision++
			case "platform":
				q.Platform = "another-platform"
			}
			status, code := s.DispatchCommand(&a, DispatchMutationRequest{p.Material.ProposalID, p.Digest})
			if code != "" || status.Code != "LOCAL_SANDBOX_REQUIRED" || backend.calls.Load() != 0 {
				t.Fatal("unqualified provider ran")
			}
		})
	}
}
func TestQualifiedTestProviderReceivesPinnedScopeAndOneImmutableAttempt(t *testing.T) {
	s, a, g, _, name := commandFixture(t)
	backend := &fakeCommandProvider{run: func(ctx context.Context, launch commandLaunch) commandResult {
		if launch.Cwd == nil || launch.Executable == nil || len(launch.Roots) != 1 || launch.Roots[0].Grant.ID != g || launch.Roots[0].Grant.AllowDestructive || launch.Spec.Argv[0] != "literal;not-shell" || launch.Spec.EnvironmentPolicy != commandEnvironment {
			t.Error("launch binding lost")
		}
		return commandResult{Output: "scoped result", CleanupConfirmed: true}
	}}
	s.commandProvider = qualifyTestProvider(backend)
	p := prepareTestCommand(t, s, a, g, name, 1)
	(*p.Material.Operation.Command.Argv)[0] = "changed"
	p.Material.CommandPrecondition.Argv[0] = "changed"
	var wg sync.WaitGroup
	var admitted atomic.Int32
	for range 8 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, code := s.DispatchCommand(&a, DispatchMutationRequest{p.Material.ProposalID, p.Digest}); code == "" {
				admitted.Add(1)
			}
		}()
	}
	wg.Wait()
	status := waitCommand(t, s, a, p.Material.ProposalID, func(s OperationStatus) bool { return s.Status != "running" })
	if status.Status != "succeeded" || !status.MayHaveChanged || backend.calls.Load() != 1 || admitted.Load() != 1 {
		t.Fatal("one-attempt contract failed")
	}
	output, code := s.CommandOutput(&a, OperationReference{p.Material.ProposalID})
	if code != "" || output.Output != "scoped result" {
		t.Fatal("scoped output unavailable")
	}
	if _, code := s.MutationStatus(&a, OperationReference{p.Material.ProposalID}); code != "LOCAL_OPERATION_UNAVAILABLE" {
		t.Fatal("wrong operation channel accepted")
	}
	if _, code := s.UpdateGrants(&a, GrantSnapshot{NextRevision: 2, Grants: []fsutil.ReadGrant{}}); code != "" {
		t.Fatal(code)
	}
	a.GrantRevision = 2
	if _, code := s.CommandOutput(&a, OperationReference{p.Material.ProposalID}); code != "LOCAL_OPERATION_UNAVAILABLE" {
		t.Fatal("revoked output leaked")
	}
	if status, code := s.CommandStatus(&a, OperationReference{p.Material.ProposalID}); code != "" || status.Status != "succeeded" {
		t.Fatal("metadata lost on revocation")
	}
}
func TestChangedExecutableAndCwdRefuseBeforeProvider(t *testing.T) {
	for _, target := range []string{"executable", "cwd"} {
		t.Run(target, func(t *testing.T) {
			s, a, g, dir, name := commandFixture(t)
			backend := &fakeCommandProvider{}
			s.commandProvider = qualifyTestProvider(backend)
			if err := os.Mkdir(filepath.Join(dir, "sub"), 0700); err != nil {
				t.Fatal(err)
			}
			args := []string{"literal"}
			p, code := s.PrepareCommand(&a, PrepareMutationRequest{ProposalID: fmt.Sprintf("local-proposal-%032x", 1), Operation: ProposalOperation{Kind: "execute_command", GrantID: g, RelativePath: "sub", Command: &CommandInput{Shell: "direct", Executable: &name, Argv: &args}}})
			if code != "" {
				t.Fatal(code)
			}
			if target == "executable" {
				path := p.Material.CommandPrecondition.Executable.Path
				if err := os.Rename(path, path+".old"); err != nil {
					t.Fatal(err)
				}
				if err := os.WriteFile(path, []byte("replacement"), 0700); err != nil {
					t.Fatal(err)
				}
			} else {
				old := filepath.Join(dir, "sub")
				err := os.Rename(old, old+".old")
				if err != nil && runtime.GOOS == "windows" {
					s.operations.mu.Lock()
					s.operations.prepared[p.Material.ProposalID].command.cwd.Close()
					s.operations.mu.Unlock()
					err = os.Rename(old, old+".old")
				}
				if err != nil {
					t.Fatal(err)
				}
				if err := os.Mkdir(old, 0700); err != nil {
					t.Fatal(err)
				}
			}
			if _, code := s.DispatchCommand(&a, DispatchMutationRequest{p.Material.ProposalID, p.Digest}); code != "" {
				t.Fatal(code)
			}
			status := waitCommand(t, s, a, p.Material.ProposalID, func(s OperationStatus) bool { return s.Status != "running" })
			if status.Status != "conflict" || status.MayHaveChanged || backend.calls.Load() != 0 {
				t.Fatal("changed target reached provider")
			}
		})
	}
}
func TestCommandsShareFileAdmissionAndCancellationRetainsObservedResult(t *testing.T) {
	s, a, g, _, name := commandFixture(t)
	entered := make(chan struct{})
	backend := &fakeCommandProvider{run: func(ctx context.Context, _ commandLaunch) commandResult {
		close(entered)
		<-ctx.Done()
		return commandResult{Cancelled: true, CleanupConfirmed: true}
	}}
	s.commandProvider = qualifyTestProvider(backend)
	file := prepareMutation(t, s, a, g, "file", 2)
	p := prepareTestCommand(t, s, a, g, name, 1)
	if _, code := s.DispatchCommand(&a, DispatchMutationRequest{p.Material.ProposalID, p.Digest}); code != "" {
		t.Fatal(code)
	}
	<-entered
	if _, code := s.DispatchMutation(&a, DispatchMutationRequest{file.Material.ProposalID, file.Digest}); code != "LOCAL_OPERATION_BUSY" {
		t.Fatal("file overlapped command", code)
	}
	if got, code := s.CancelCommand(&a, OperationReference{p.Material.ProposalID}); code != "" || got.Status != "running" {
		t.Fatal("cancel promised rollback")
	}
	status := waitCommand(t, s, a, p.Material.ProposalID, func(s OperationStatus) bool { return s.Status != "running" })
	if status.Status != "cancelled" || !status.MayHaveChanged {
		t.Fatal("cancellation effect ambiguity lost")
	}
	if _, code := s.DispatchMutation(&a, DispatchMutationRequest{file.Material.ProposalID, file.Digest}); code != "" {
		t.Fatal("confirmed cleanup retained admission", code)
	}
	awaitMutation(t, s, a, file.Material.ProposalID)
}
func TestUnconfirmedProviderCleanupRetainsLifecycleAndBlocksReuse(t *testing.T) {
	s, a, g, _, name := commandFixture(t)
	release := make(chan struct{})
	var released atomic.Bool
	backend := &fakeCommandProvider{run: func(context.Context, commandLaunch) commandResult { return commandResult{CleanupConfirmed: false} }, cleanup: func(ctx context.Context, _ string) bool {
		select {
		case <-release:
			return true
		case <-ctx.Done():
			return false
		}
	}}
	s.commandProvider = qualifyTestProvider(backend)
	t.Cleanup(func() {
		if released.CompareAndSwap(false, true) {
			close(release)
		}
	})
	p := prepareTestCommand(t, s, a, g, name, 1)
	if _, code := s.DispatchCommand(&a, DispatchMutationRequest{p.Material.ProposalID, p.Digest}); code != "" {
		t.Fatal(code)
	}
	status := waitCommand(t, s, a, p.Material.ProposalID, func(s OperationStatus) bool { return s.CleanupPending })
	if status.Code != "LOCAL_CLEANUP_UNCONFIRMED" || !status.MayHaveChanged {
		t.Fatal("cleanup uncertainty hidden")
	}
	if code := s.Check(&a); code != "LOCAL_WORKSPACE_BLOCKED" {
		t.Fatal("uncertain cleanup retained admission")
	}
	s.work.Stop()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Millisecond)
	defer cancel()
	if err := s.work.Wait(ctx); err == nil {
		t.Fatal("lifecycle forgot unfinished cleanup")
	}
	released.Store(true)
	close(release)
	waitCommand(t, s, a, p.Material.ProposalID, func(s OperationStatus) bool { return !s.CleanupPending })
	if code := s.Check(&a); code != "LOCAL_WORKSPACE_BLOCKED" {
		t.Fatal("authority silently resumed without clean restart")
	}
}
func TestEffectiveShellTransportAndBoundsAreClosed(t *testing.T) {
	script := "literal 'quoted'\n资料"
	for _, shell := range []string{"cmd", "powershell", "pwsh", "sh"} {
		c := CommandInput{Shell: shell, Script: &script}
		for _, platform := range []string{"windows", "linux"} {
			name, args, err := c.launchArgs(platform)
			supported := platform == "windows" && shell != "sh" || platform == "linux" && shell == "sh"
			if supported && (err != nil || name == "" || len(args) == 0) || !supported && err == nil {
				t.Fatal("shell fallback or transport mismatch")
			}
		}
	}
	long := uint32(999)
	zero := uint32(0)
	if commandTimeout(nil) != 30000 || commandTimeout(&zero) != 30000 || commandTimeout(&long) != 120000 {
		t.Fatal("effective deadline not clamped")
	}
	invalid := []string{`{"shell":"direct","executable":"echo","argv":[],"env":{}}`, `{"shell":"sh","script":"ok","requires_sandbox":false}`, `{"shell":"cmd","script":"ok","approved":true}`}
	for _, raw := range invalid {
		var c CommandInput
		if Decode([]byte(raw), &c) == nil {
			t.Fatal("caller policy accepted")
		}
	}
}

func TestCommandDeadlineAndCapturedOutputAreBounded(t *testing.T) {
	s, a, g, _, name := commandFixture(t)
	backend := &fakeCommandProvider{run: func(ctx context.Context, _ commandLaunch) commandResult {
		<-ctx.Done()
		return commandResult{CleanupConfirmed: true}
	}}
	s.commandProvider = qualifyTestProvider(backend)
	args := []string{}
	seconds := uint32(1)
	p, code := s.PrepareCommand(&a, PrepareMutationRequest{ProposalID: fmt.Sprintf("local-proposal-%032x", 1), Operation: ProposalOperation{Kind: "execute_command", GrantID: g, RelativePath: ".", Command: &CommandInput{Shell: "direct", Executable: &name, Argv: &args}, TimeoutSeconds: &seconds}})
	if code != "" {
		t.Fatal(code)
	}
	if _, code := s.DispatchCommand(&a, DispatchMutationRequest{p.Material.ProposalID, p.Digest}); code != "" {
		t.Fatal(code)
	}
	status := waitCommand(t, s, a, p.Material.ProposalID, func(s OperationStatus) bool { return s.Status != "running" })
	if status.Status != "timed_out" || status.Code != "LOCAL_COMMAND_TIMEOUT" || !status.MayHaveChanged {
		t.Fatal("execution deadline did not reach provider")
	}
	backend.run = func(context.Context, commandLaunch) commandResult {
		return commandResult{Output: strings.Repeat("资料", commandOutputBytes), CleanupConfirmed: true}
	}
	q := prepareTestCommand(t, s, a, g, name, 2)
	if _, code := s.DispatchCommand(&a, DispatchMutationRequest{q.Material.ProposalID, q.Digest}); code != "" {
		t.Fatal(code)
	}
	if status := waitCommand(t, s, a, q.Material.ProposalID, func(s OperationStatus) bool { return s.Status != "running" }); status.Status != "output_limited" {
		t.Fatal("output limit hidden")
	}
	out, code := s.CommandOutput(&a, OperationReference{q.Material.ProposalID})
	if code != "" || !out.Truncated || len(out.Output) > commandOutputBytes {
		t.Fatal("unbounded captured output")
	}
}
