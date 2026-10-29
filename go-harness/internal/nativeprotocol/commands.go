package nativeprotocol

import (
	"context"
	"errors"
	"github.com/invidias-codem/ai-saas/go-harness/internal/fsutil"
	"os"
	"runtime"
	"time"
	"unicode/utf8"
)

// Trusted qualification record, separate from the backend interface. There is
// no production record/registration path in this slice. Tests construct a fake
// record explicitly; JSON, env/CLI flags and backend claims cannot mint one.
type commandQualification struct {
	Binding                                                                                   ProviderBinding
	Platform                                                                                  string
	Files, Network, NonElevated, Descendants, WorkspacePolicy, PinnedLaunch, CleanEnvironment bool
}
type qualifiedCommandProvider struct {
	qualification commandQualification
	backend       commandProvider
}

func (p *qualifiedCommandProvider) binding() ProviderBinding {
	if p == nil {
		return ProviderBinding{ID: "unavailable"}
	}
	return p.qualification.Binding
}
func (p *qualifiedCommandProvider) admitted(expected ProviderBinding) bool {
	if p == nil || p.backend == nil {
		return false
	}
	q := p.qualification
	return q.Binding.valid() && q.Binding.ID != "unavailable" && q.Binding == expected && q.Platform == runtime.GOOS && q.Files && q.Network && q.NonElevated && q.Descendants && q.WorkspacePolicy && q.PinnedLaunch && q.CleanEnvironment
}

type commandLaunch struct {
	OperationID string
	Authority   Authority
	Spec        CommandPrecondition
	Cwd         *os.Root
	Executable  *os.File
	Roots       []fsutil.NativeExecutionRoot
}
type commandProvider interface {
	Run(context.Context, commandLaunch) commandResult
	// Must confirm termination of all owned descendants/resources, including
	// after timeout/cancellation. False retains daemon work and blocks reuse.
	ConfirmCleanup(context.Context, string) bool
}
type commandResult struct {
	Output                                           string
	ExitCode                                         int
	TimedOut, Cancelled, Truncated, CleanupConfirmed bool
}
type CommandOutput struct {
	Output    string `json:"output"`
	ExitCode  int    `json:"exit_code"`
	TimedOut  bool   `json:"timed_out"`
	Cancelled bool   `json:"cancelled"`
	Truncated bool   `json:"truncated"`
}

func (s *Session) PrepareCommand(candidate *Authority, req PrepareMutationRequest) (PreparedMutation, string) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if code := s.check(candidate); code != "" {
		return PreparedMutation{}, code
	}
	op := req.Operation
	if !validID(req.ProposalID, "local-proposal-") || !validID(op.GrantID, "local-grant-") || op.Kind != "execute_command" || op.Content != nil || op.Command == nil || !op.Command.valid() {
		return PreparedMutation{}, "LOCAL_COMMAND_INVALID"
	}
	if _, err := fsutil.NativeRelativePath(op.RelativePath); err != nil {
		return PreparedMutation{}, "LOCAL_PATH_INVALID"
	}
	s.operations.mu.Lock()
	defer s.operations.mu.Unlock()
	if s.operations.attempts[req.ProposalID] != nil {
		return PreparedMutation{}, "LOCAL_OPERATION_REPLAYED"
	}
	if s.operations.prepared[req.ProposalID] != nil {
		return PreparedMutation{}, "LOCAL_REVIEW_DENIED"
	}
	if len(s.operations.prepared) >= maxPreparedMutations || len(s.operations.attempts) >= maxMutationAttempts {
		return PreparedMutation{}, "LOCAL_PROPOSAL_CAPACITY"
	}
	cwd, err := s.registry.PrepareNativeDirectory(candidate.PrincipalID, candidate.WorkspaceID, op.GrantID, op.RelativePath)
	if err != nil {
		return PreparedMutation{}, "LOCAL_GRANT_DENIED"
	}
	file, identity, args, err := prepareExecutable(*op.Command)
	if err != nil {
		cwd.Close()
		return PreparedMutation{}, "LOCAL_SHELL_UNAVAILABLE"
	}
	pins := &commandPins{cwd: cwd, executable: file}
	timeout := commandTimeout(op.TimeoutSeconds)
	seconds := timeout / 1000
	op.TimeoutSeconds = &seconds
	pre := &CommandPrecondition{Platform: runtime.GOOS, Shell: op.Command.Shell, CwdIdentity: cwd.Identity, Executable: identity, Argv: args, TimeoutMS: timeout, OutputLimit: commandOutputBytes, EnvironmentPolicy: commandEnvironment, Requirements: commandRequirements, Provider: s.commandProvider.binding(), RequiresSandbox: true}
	material := ProposalMaterial{ProposalID: req.ProposalID, Authority: *candidate, DisplayRoot: cwd.Grant.Path, ReadOnly: cwd.Grant.ReadOnly, TTLMillis: 300000, Operation: op, CommandPrecondition: pre}
	digest, err := ProposalDigest(material)
	if err != nil {
		pins.close()
		return PreparedMutation{}, "LOCAL_COMMAND_INVALID"
	}
	p := &preparedMutation{prepared: PreparedMutation{Material: cloneMaterial(material), Digest: digest}, command: pins, deadline: s.now().Add(mutationLifetime)}
	s.operations.prepared[req.ProposalID] = p
	p.timer = time.AfterFunc(mutationLifetime, func() {
		s.operations.mu.Lock()
		defer s.operations.mu.Unlock()
		if s.operations.prepared[req.ProposalID] == p {
			p.close()
			delete(s.operations.prepared, req.ProposalID)
		}
	})
	return PreparedMutation{Material: cloneMaterial(material), Digest: digest}, ""
}

func (s *Session) DispatchCommand(candidate *Authority, req DispatchMutationRequest) (OperationStatus, string) {
	s.mu.RLock()
	fail := func(code string) (OperationStatus, string) { s.mu.RUnlock(); return OperationStatus{}, code }
	if code := s.check(candidate); code != "" {
		return fail(code)
	}
	s.operations.mu.Lock()
	reject := func(code string) (OperationStatus, string) { s.operations.mu.Unlock(); return fail(code) }
	if s.operations.attempts[req.ProposalID] != nil {
		return reject("LOCAL_OPERATION_REPLAYED")
	}
	p := s.operations.prepared[req.ProposalID]
	if p == nil {
		return reject("LOCAL_PROPOSAL_UNAVAILABLE")
	}
	if p.command == nil || p.prepared.Digest != req.Digest || p.prepared.Material.Authority != *candidate {
		return reject("LOCAL_REVIEW_DENIED")
	}
	if !s.now().Before(p.deadline) {
		p.close()
		delete(s.operations.prepared, req.ProposalID)
		return reject("LOCAL_REVIEW_DENIED")
	}
	if len(s.operations.attempts) >= maxMutationAttempts {
		return reject("LOCAL_PROPOSAL_CAPACITY")
	}
	if s.operations.active != "" {
		return reject("LOCAL_OPERATION_BUSY")
	}
	status := OperationStatus{ProposalID: req.ProposalID, Digest: req.Digest, Status: "running"}
	attempt := &mutationAttempt{authority: *candidate, status: status, command: true}
	s.operations.attempts[req.ProposalID] = attempt
	delete(s.operations.prepared, req.ProposalID)
	p.timer.Stop()
	provider := s.commandProvider
	if !provider.admitted(p.prepared.Material.CommandPrecondition.Provider) {
		status.Status = "denied"
		status.Code = "LOCAL_SANDBOX_REQUIRED"
		attempt.status = status
		p.close()
		s.operations.mu.Unlock()
		s.mu.RUnlock()
		return status, ""
	}
	ctx, finish, err := s.work.Begin(s.work.Context())
	if err != nil {
		status.Status = "denied"
		status.Code = "LOCAL_WORKSPACE_BLOCKED"
		attempt.status = status
		p.close()
		s.operations.mu.Unlock()
		s.mu.RUnlock()
		return status, ""
	}
	ctx, cancel := context.WithTimeout(ctx, time.Duration(p.prepared.Material.CommandPrecondition.TimeoutMS)*time.Millisecond)
	attempt.cancel = cancel
	s.operations.active = req.ProposalID
	s.operations.mu.Unlock()
	go func() {
		defer finish()
		defer s.mu.RUnlock()
		defer cancel()
		defer p.close()
		s.runCommand(ctx, provider, p, attempt)
	}()
	return status, ""
}

func (s *Session) runCommand(ctx context.Context, provider *qualifiedCommandProvider, p *preparedMutation, attempt *mutationAttempt) {
	material := p.prepared.Material
	op := material.Operation
	pre := *material.CommandPrecondition
	status := attempt.status
	status.Status = "conflict"
	status.Code = "LOCAL_FILE_CONFLICT"
	var output *CommandOutput
	err := s.registry.WithNativeExecutionScope(material.Authority.PrincipalID, material.Authority.WorkspaceID, op.GrantID, op.RelativePath, pre.CwdIdentity, func(scope fsutil.NativeExecutionScope) error {
		file, current, args, err := prepareExecutable(*op.Command)
		if err != nil {
			return err
		}
		defer file.Close()
		if current != pre.Executable || len(args) != len(pre.Argv) {
			return errors.New("executable changed")
		}
		for i := range args {
			if args[i] != pre.Argv[i] {
				return errors.New("launch changed")
			}
		}
		if !provider.admitted(pre.Provider) {
			return errors.New("provider changed")
		}
		if ctx.Err() != nil {
			status.Status = "cancelled"
			status.Code = "LOCAL_OPERATION_CANCELLED"
			return nil
		}
		spec := pre
		spec.Argv = append([]string{}, pre.Argv...)
		result := provider.backend.Run(ctx, commandLaunch{OperationID: material.ProposalID, Authority: material.Authority, Spec: spec, Cwd: scope.Cwd, Executable: file, Roots: scope.Roots})
		if !result.CleanupConfirmed {
			s.unsafeCommandCleanup.Store(true)
			pending := OperationStatus{ProposalID: material.ProposalID, Digest: p.prepared.Digest, Status: "outcome_unknown", Code: "LOCAL_CLEANUP_UNCONFIRMED", MayHaveChanged: true, CleanupPending: true}
			s.operations.mu.Lock()
			attempt.status = pending
			s.operations.mu.Unlock()
			for {
				cleanup, stop := context.WithTimeout(context.Background(), 5*time.Second)
				confirmed := provider.backend.ConfirmCleanup(cleanup, material.ProposalID)
				stop()
				if confirmed {
					break
				}
				// Do not abandon lifecycle ownership on cancellation. An unconfirmed
				// provider makes the daemon's bounded shutdown fail rather than exit clean.
				time.Sleep(100 * time.Millisecond)
			}
		}
		result.Cancelled = result.Cancelled || ctx.Err() == context.Canceled
		result.TimedOut = result.TimedOut || ctx.Err() == context.DeadlineExceeded
		if !utf8.ValidString(result.Output) {
			result.Output = ""
			result.Truncated = true
		}
		if len(result.Output) > commandOutputBytes {
			result.Output = result.Output[:commandOutputBytes]
			for !utf8.ValidString(result.Output) {
				result.Output = result.Output[:len(result.Output)-1]
			}
			result.Truncated = true
		}
		output = &CommandOutput{Output: result.Output, ExitCode: result.ExitCode, TimedOut: result.TimedOut, Cancelled: result.Cancelled, Truncated: result.Truncated}
		status = OperationStatus{ProposalID: material.ProposalID, Digest: p.prepared.Digest, Status: "succeeded", MayHaveChanged: true}
		if result.ExitCode != 0 {
			status.Status = "failed"
			status.Code = "LOCAL_COMMAND_EXIT_NONZERO"
		}
		if result.Truncated {
			status.Status = "output_limited"
			status.Code = "LOCAL_COMMAND_OUTPUT_LIMIT"
		}
		if result.TimedOut {
			status.Status = "timed_out"
			status.Code = "LOCAL_COMMAND_TIMEOUT"
		}
		if result.Cancelled {
			status.Status = "cancelled"
			status.Code = "LOCAL_COMMAND_CANCELLED"
		}
		return nil
	})
	if err != nil {
		status.MayHaveChanged = false
	}
	s.operations.mu.Lock()
	attempt.status = status
	attempt.output = output
	s.operations.active = ""
	s.operations.mu.Unlock()
}

// Cleanup uncertainty blocks execution/data admission, while current-scope
// metadata status/cancellation can still observe the owned operation.
func (s *Session) checkCommandMetadata(a *Authority) string {
	if s.bound == nil {
		return "LOCAL_SESSION_UNBOUND"
	}
	if a == nil || *a != *s.bound {
		return "LOCAL_AUTHORITY_MISMATCH"
	}
	if s.blocked {
		return "LOCAL_WORKSPACE_BLOCKED"
	}
	return ""
}
func (s *Session) CommandStatus(a *Authority, req OperationReference) (OperationStatus, string) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if code := s.checkCommandMetadata(a); code != "" {
		return OperationStatus{}, code
	}
	s.operations.mu.Lock()
	defer s.operations.mu.Unlock()
	attempt := s.operations.attempts[req.ProposalID]
	if attempt == nil || !attempt.command || !sameOperationScope(attempt.authority, *a) {
		return OperationStatus{}, "LOCAL_OPERATION_UNAVAILABLE"
	}
	return attempt.status, ""
}
func (s *Session) CancelCommand(a *Authority, req OperationReference) (OperationStatus, string) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if code := s.checkCommandMetadata(a); code != "" {
		return OperationStatus{}, code
	}
	s.operations.mu.Lock()
	defer s.operations.mu.Unlock()
	if p := s.operations.prepared[req.ProposalID]; p != nil && p.command != nil && p.prepared.Material.Authority == *a {
		status := OperationStatus{ProposalID: req.ProposalID, Digest: p.prepared.Digest, Status: "cancelled", Code: "LOCAL_OPERATION_CANCELLED"}
		p.close()
		delete(s.operations.prepared, req.ProposalID)
		return status, ""
	}
	attempt := s.operations.attempts[req.ProposalID]
	if attempt == nil || !attempt.command || !sameOperationScope(attempt.authority, *a) {
		return OperationStatus{}, "LOCAL_OPERATION_UNAVAILABLE"
	}
	if attempt.cancel != nil && (attempt.status.Status == "running" || attempt.status.CleanupPending) {
		attempt.cancel()
	}
	return attempt.status, ""
}
func (s *Session) CommandOutput(a *Authority, req OperationReference) (CommandOutput, string) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if code := s.check(a); code != "" {
		return CommandOutput{}, code
	}
	s.operations.mu.Lock()
	defer s.operations.mu.Unlock()
	attempt := s.operations.attempts[req.ProposalID]
	if attempt == nil || !attempt.command || attempt.authority != *a || attempt.output == nil {
		return CommandOutput{}, "LOCAL_OPERATION_UNAVAILABLE"
	}
	return *attempt.output, ""
}
