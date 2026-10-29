// Package nativeprotocol owns the desktop-only control plane. It never derives
// identity or permissions from an agent's proposed tool inputs.
package nativeprotocol

import (
	"regexp"
	"sync"
)

const Version = 1

var Features = [...]string{"session-authority-v1", "native-action-allowlist-v1"}
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
	mu         sync.Mutex
	negotiated bool
	bound      *Authority
}

func NewSession() *Session { return &Session{} }

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
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.bound == nil {
		return "LOCAL_SESSION_UNBOUND"
	}
	// These are nonsecret scope identifiers/revisions, never auth credentials.
	if candidate == nil || *candidate != *s.bound {
		return "LOCAL_AUTHORITY_MISMATCH"
	}
	return ""
}

func (s *Session) IsBound() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.bound != nil
}
