package nativeprotocol

import (
	"crypto/sha3"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"strings"
	"unicode/utf8"

	"github.com/invidias-codem/ai-saas/go-harness/internal/fsutil"
)

// ProposalMaterial is integrity data, not an authorization envelope. Native Go
// dispatch still has no proposal/approval/mutation endpoint in S2c.3.
type ProposalMaterial struct {
	ProposalID  string            `json:"proposal_id"`
	Authority   Authority         `json:"authority"`
	DisplayRoot string            `json:"display_root"`
	ReadOnly    bool              `json:"read_only"`
	TTLMillis   uint32            `json:"ttl_ms"`
	Operation   ProposalOperation `json:"operation"`
}
type ProposalOperation struct {
	Kind         string  `json:"kind"`
	GrantID      string  `json:"grant_id"`
	RelativePath string  `json:"relative_path"`
	Content      *string `json:"content,omitempty"`
}

func ProposalDigest(p ProposalMaterial) (string, error) {
	if !validID(p.ProposalID, "local-proposal-") || !validID(p.Authority.PrincipalID, "local-user-") || !validID(p.Authority.WorkspaceID, "local-workspace-") || !localID.MatchString(p.Authority.Generation) || p.Authority.PolicyRevision == 0 || p.TTLMillis != 300000 || !validID(p.Operation.GrantID, "local-grant-") || len(p.DisplayRoot) > 32768 || !utf8.ValidString(p.DisplayRoot) {
		return "", errors.New("invalid proposal material")
	}
	if _, err := fsutil.NativeRelativePath(p.Operation.RelativePath); err != nil || p.Operation.RelativePath == "." {
		return "", errors.New("invalid proposal path")
	}
	tag := byte(0)
	switch p.Operation.Kind {
	case "create_file":
		if p.Operation.Content == nil || len(*p.Operation.Content) > fsutil.MaxLocalReadBytes || !utf8.ValidString(*p.Operation.Content) || strings.IndexByte(*p.Operation.Content, 0) >= 0 {
			return "", errors.New("invalid proposal content")
		}
		tag = 1
	case "create_directory":
		if p.Operation.Content != nil {
			return "", errors.New("unexpected proposal content")
		}
		tag = 2
	default:
		return "", errors.New("unsupported proposal operation")
	}
	data := []byte("LATTICE_NATIVE_PROPOSAL\x00\x01")
	field := func(value string) {
		data = binary.BigEndian.AppendUint32(data, uint32(len(value)))
		data = append(data, []byte(value)...)
	}
	for _, value := range []string{p.ProposalID, p.Authority.PrincipalID, p.Authority.WorkspaceID, p.Authority.Generation} {
		field(value)
	}
	data = binary.BigEndian.AppendUint64(data, p.Authority.PolicyRevision)
	data = binary.BigEndian.AppendUint64(data, p.Authority.GrantRevision)
	field(p.Operation.GrantID)
	field(p.DisplayRoot)
	if p.ReadOnly {
		data = append(data, 1)
	} else {
		data = append(data, 0)
	}
	data = binary.BigEndian.AppendUint32(data, p.TTLMillis)
	data = append(data, tag)
	field(p.Operation.RelativePath)
	if p.Operation.Content != nil {
		field(*p.Operation.Content)
	}
	field("must_be_absent")
	digest := sha3.Sum256(data)
	return hex.EncodeToString(digest[:]), nil
}
