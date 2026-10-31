// Package nativeprotocol owns the desktop-only control plane. It never derives
// identity or permissions from an agent's proposed tool inputs.
package nativeprotocol

import (
	"context"
	"regexp"
	"sync"
	"sync/atomic"
	"time"

	"github.com/invidias-codem/ai-saas/go-harness/internal/fsutil"
	"github.com/invidias-codem/ai-saas/go-harness/internal/lifecycle"
)

const Version = 1

var Features = [...]string{"session-authority-v1", "native-action-allowlist-v1", "read-grants-v1", "guarded-file-mutations-v1", "command-admission-v1"}
var localID = regexp.MustCompile(`^[a-f0-9]{32}$`)

type Authority struct {
	PrincipalID    string `json:"principal_id"`
	WorkspaceID    string `json:"workspace_id"`
	Generation     string `json:"generation"`
	PolicyRevision uint64 `json:"policy_revision"`
	GrantRevision  uint64 `json:"grant_revision"`
}

func validID(value, prefix string) bool {
	return len(value) == len(prefix)+32 && value[:len(prefix)] == prefix && localID.MatchString(value[len(prefix):])
}

func (a Authority) validInitial() bool {
	return validID(a.PrincipalID, "local-user-") && validID(a.WorkspaceID, "local-workspace-") &&
		localID.MatchString(a.Generation) && a.PolicyRevision == 1 && a.GrantRevision == 0
}

type Protocol struct {
	ProtocolVersion uint32   `json:"protocol_version"`
	Mode            string   `json:"mode"`
	Features        []string `json:"features"`
}

type Binding struct {
	ProtocolVersion uint32    `json:"protocol_version"`
	Authority       Authority `json:"authority"`
}

type Session struct {
	mu         sync.RWMutex
	negotiated bool
	bound      *Authority
	blocked    bool
	registry   *fsutil.RootRegistry
	operations mutationBook
	work       *lifecycle.Group
	ownWork    bool
	now        func() time.Time
	apply      func(context.Context, string, string, string, string, string, string, fsutil.FilePrecondition) fsutil.MutationResult
	// Deliberately nil in every production constructor. Qualification is never
	// accepted from JSON, environment, CLI, grant flags or provider self-report.
	commandProvider      *qualifiedCommandProvider
	unsafeCommandCleanup atomic.Bool
}

func NewSession() *Session {
	s := NewSessionWithWork(lifecycle.New(context.Background()))
	s.ownWork = true
	return s
}
func NewSessionWithWork(work *lifecycle.Group) *Session {
	r := fsutil.NewRootRegistry()
	return &Session{registry: r, work: work, now: time.Now, apply: r.ApplyNativeMutation, operations: mutationBook{prepared: make(map[string]*preparedMutation), attempts: make(map[string]*mutationAttempt)}}
}

func (s *Session) Negotiate() Protocol {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.negotiated = true
	return Protocol{Version, "local", append([]string(nil), Features[:]...)}
}

func (s *Session) Bind(binding Binding) string {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.bound != nil {
		return "LOCAL_SESSION_ALREADY_BOUND"
	}
	if !s.negotiated {
		return "LOCAL_PROTOCOL_REQUIRED"
	}
	if binding.ProtocolVersion != Version {
		return "LOCAL_PROTOCOL_INCOMPATIBLE"
	}
	if !binding.Authority.validInitial() {
		return "LOCAL_AUTHORITY_INVALID"
	}
	a := binding.Authority
	s.bound = &a
	return ""
}

func (s *Session) Check(candidate *Authority) string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.check(candidate)
}

func (s *Session) check(candidate *Authority) string {
	if s.bound == nil {
		return "LOCAL_SESSION_UNBOUND"
	}
	// These are nonsecret scope identifiers/revisions, never auth credentials.
	if candidate == nil || *candidate != *s.bound {
		return "LOCAL_AUTHORITY_MISMATCH"
	}
	if s.blocked || s.unsafeCommandCleanup.Load() {
		return "LOCAL_WORKSPACE_BLOCKED"
	}
	return ""
}

func (s *Session) IsBound() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.bound != nil
}
