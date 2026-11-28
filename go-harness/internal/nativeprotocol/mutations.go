package nativeprotocol

import (
	"context"
	"github.com/invidias-codem/ai-saas/go-harness/internal/fsutil"
	"strings"
	"sync"
	"time"
	"unicode/utf8"
)

const maxPreparedMutations = 32
const maxMutationAttempts = 4096
const mutationLifetime = 5 * time.Minute

type PrepareMutationRequest struct {
	ProposalID string            `json:"proposal_id"`
	Operation  ProposalOperation `json:"operation"`
}
type DispatchMutationRequest struct {
	ProposalID string `json:"proposal_id"`
	Digest     string `json:"digest"`
}
type OperationReference struct {
	ProposalID string `json:"proposal_id"`
}
type PreparedMutation struct {
	Material ProposalMaterial `json:"material"`
	Digest   string           `json:"digest"`
}
type OperationStatus struct {
	ProposalID     string `json:"proposal_id"`
	Digest         string `json:"digest"`
	Status         string `json:"status"`
	Code           string `json:"code"`
	MayHaveChanged bool   `json:"may_have_changed"`
	CleanupPending bool   `json:"cleanup_pending,omitempty"`
}
type preparedMutation struct {
	prepared PreparedMutation
	target   *fsutil.PreparedTarget
	command  *commandPins
	deadline time.Time
	timer    *time.Timer
}

func (p *preparedMutation) close() {
	if p.timer != nil {
		p.timer.Stop()
	}
	if p.target != nil {
		p.target.Close()
	}
	if p.command != nil {
		p.command.close()
	}
}

type mutationAttempt struct {
	authority Authority
	status    OperationStatus
	cancel    context.CancelFunc
	command   bool
	output    *CommandOutput
}
type mutationBook struct {
	mu       sync.Mutex
	prepared map[string]*preparedMutation
	attempts map[string]*mutationAttempt
	active   string
}

// Caller holds the session lock. Permissions change only after admitted owned
// work has left that boundary; prepared handles are invalidated atomically.
func (s *Session) invalidatePrepared() {
	s.operations.mu.Lock()
	defer s.operations.mu.Unlock()
	for id, p := range s.operations.prepared {
		p.close()
		delete(s.operations.prepared, id)
	}
}
func cloneMaterial(p ProposalMaterial) ProposalMaterial {
	if p.Operation.Command != nil {
		c := *p.Operation.Command
		if c.Executable != nil {
			value := *c.Executable
			c.Executable = &value
		}
		if c.Script != nil {
			value := *c.Script
			c.Script = &value
		}
		if c.Argv != nil {
			value := append([]string{}, (*c.Argv)...)
			c.Argv = &value
		}
		p.Operation.Command = &c
	}
	if p.Operation.TimeoutSeconds != nil {
		value := *p.Operation.TimeoutSeconds
		p.Operation.TimeoutSeconds = &value
	}
	if p.CommandPrecondition != nil {
		value := *p.CommandPrecondition
		value.Argv = append([]string{}, value.Argv...)
		p.CommandPrecondition = &value
	}
	if p.Operation.Content != nil {
		content := *p.Operation.Content
		p.Operation.Content = &content
	}
	if p.Precondition != nil {
		pre := *p.Precondition
		if pre.Base != nil {
			base := *pre.Base
			pre.Base = &base
		}
		p.Precondition = &pre
	}
	return p
}
func validMutation(op ProposalOperation) bool {
	if op.Command != nil || op.TimeoutSeconds != nil {
		return false
	}
	if !validID(op.GrantID, "local-grant-") || op.RelativePath == "." {
		return false
	}
	if _, err := fsutil.NativeRelativePath(op.RelativePath); err != nil {
		return false
	}
	switch op.Kind {
	case "create_directory":
		return op.Content == nil
	case "create_file", "write_text":
		return op.Content != nil && len(*op.Content) <= fsutil.MaxLocalReadBytes && utf8.ValidString(*op.Content) && !strings.ContainsRune(*op.Content, 0)
	default:
		return false
	}
}
func (s *Session) PrepareMutation(candidate *Authority, req PrepareMutationRequest) (PreparedMutation, string) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if code := s.check(candidate); code != "" {
		return PreparedMutation{}, code
	}
	if !validID(req.ProposalID, "local-proposal-") || !validMutation(req.Operation) {
		return PreparedMutation{}, "LOCAL_PROPOSAL_INVALID"
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
	target, code := s.registry.PrepareNativeTarget(candidate.PrincipalID, candidate.WorkspaceID, req.Operation.GrantID, req.Operation.RelativePath, req.Operation.Kind)
	if code != "" {
		return PreparedMutation{}, code
	}
	material := ProposalMaterial{ProposalID: req.ProposalID, Authority: *candidate, DisplayRoot: target.DisplayRoot, ReadOnly: target.ReadOnly, TTLMillis: 300000, Operation: req.Operation, Precondition: &target.Precondition}
	digest, err := ProposalDigest(material)
	if err != nil {
		target.Close()
		return PreparedMutation{}, "LOCAL_PROPOSAL_INVALID"
	}
	p := &preparedMutation{prepared: PreparedMutation{Material: cloneMaterial(material), Digest: digest}, target: target, deadline: s.now().Add(mutationLifetime)}
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

// The trusted Rust broker sends only the exact prepared reference after native
// approval consumption. No replacement path/content or caller approval flag is
// accepted. Register the generation-long ID before spawning any filesystem work.
func (s *Session) DispatchMutation(candidate *Authority, req DispatchMutationRequest) (OperationStatus, string) {
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
	if p.command != nil {
		return reject("LOCAL_REVIEW_DENIED")
	}
	if p.prepared.Digest != req.Digest || p.prepared.Material.Authority != *candidate {
		return reject("LOCAL_REVIEW_DENIED")
	}
	if !s.now().Before(p.deadline) {
		p.close()
		delete(s.operations.prepared, req.ProposalID)
		return reject("LOCAL_REVIEW_DENIED")
	}
	if p.prepared.Material.ReadOnly {
		return reject("LOCAL_WRITE_GRANT_REQUIRED")
	}
	if len(s.operations.attempts) >= maxMutationAttempts {
		return reject("LOCAL_PROPOSAL_CAPACITY")
	}
	if s.operations.active != "" {
		return reject("LOCAL_OPERATION_BUSY")
	}
	ctx, finish, err := s.work.Begin(s.work.Context())
	if err != nil {
		return reject("LOCAL_WORKSPACE_BLOCKED")
	}
	ctx, cancel := context.WithCancel(ctx)
	status := OperationStatus{ProposalID: req.ProposalID, Digest: req.Digest, Status: "running", Code: ""}
	attempt := &mutationAttempt{authority: *candidate, status: status, cancel: cancel}
	s.operations.attempts[req.ProposalID] = attempt
	s.operations.active = req.ProposalID
	delete(s.operations.prepared, req.ProposalID)
	p.timer.Stop()
	s.operations.mu.Unlock()
	// Ownership and the session read lock move into this goroutine. HTTP context
	// cancellation cannot abandon work or acknowledge revocation prematurely.
	go func() {
		defer finish()
		defer s.mu.RUnlock()
		defer cancel()
		defer p.close()
		op := p.prepared.Material.Operation
		content := ""
		if op.Content != nil {
			content = *op.Content
		}
		result := s.apply(ctx, attempt.authority.PrincipalID, attempt.authority.WorkspaceID, op.GrantID, op.RelativePath, op.Kind, content, *p.prepared.Material.Precondition)
		observed := status
		observed.Code = result.Code
		observed.MayHaveChanged = result.MayHaveChanged
		switch result.Code {
		case "":
			observed.Status = "succeeded"
		case "LOCAL_FILE_CONFLICT":
			observed.Status = "conflict"
		case "LOCAL_OPERATION_CANCELLED":
			observed.Status = "cancelled"
		case "LOCAL_OUTCOME_UNKNOWN":
			observed.Status = "outcome_unknown"
		default:
			observed.Status = "denied"
		}
		s.operations.mu.Lock()
		attempt.status = observed
		s.operations.active = ""
		s.operations.mu.Unlock()
	}()
	return status, ""
}

func sameOperationScope(a, b Authority) bool { a.GrantRevision = 0; b.GrantRevision = 0; return a == b }
func (s *Session) MutationStatus(candidate *Authority, req OperationReference) (OperationStatus, string) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if code := s.check(candidate); code != "" {
		return OperationStatus{}, code
	}
	s.operations.mu.Lock()
	defer s.operations.mu.Unlock()
	a := s.operations.attempts[req.ProposalID]
	if a == nil || a.command || !sameOperationScope(a.authority, *candidate) {
		return OperationStatus{}, "LOCAL_OPERATION_UNAVAILABLE"
	}
	return a.status, ""
}
func (s *Session) CancelMutation(candidate *Authority, req OperationReference) (OperationStatus, string) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if code := s.check(candidate); code != "" {
		return OperationStatus{}, code
	}
	s.operations.mu.Lock()
	defer s.operations.mu.Unlock()
	if p := s.operations.prepared[req.ProposalID]; p != nil && p.command == nil && p.prepared.Material.Authority == *candidate {
		status := OperationStatus{ProposalID: req.ProposalID, Digest: p.prepared.Digest, Status: "cancelled", Code: "LOCAL_OPERATION_CANCELLED"}
		p.close()
		delete(s.operations.prepared, req.ProposalID)
		return status, ""
	}
	a := s.operations.attempts[req.ProposalID]
	if a == nil || a.command || !sameOperationScope(a.authority, *candidate) {
		return OperationStatus{}, "LOCAL_OPERATION_UNAVAILABLE"
	}
	if a.status.Status == "running" {
		a.cancel()
	}
	return a.status, ""
}
