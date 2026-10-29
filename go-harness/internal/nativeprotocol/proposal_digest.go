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

// ProposalMaterial is integrity data, not a bearer authorization envelope.
type ProposalMaterial struct {
	ProposalID   string                   `json:"proposal_id"`
	Authority    Authority                `json:"authority"`
	DisplayRoot  string                   `json:"display_root"`
	ReadOnly     bool                     `json:"read_only"`
	TTLMillis    uint32                   `json:"ttl_ms"`
	Operation    ProposalOperation        `json:"operation"`
	Precondition *fsutil.FilePrecondition `json:"precondition,omitempty"`
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
	case "create_file", "write_text":
		if p.Operation.Content == nil || len(*p.Operation.Content) > fsutil.MaxLocalReadBytes || !utf8.ValidString(*p.Operation.Content) || strings.IndexByte(*p.Operation.Content, 0) >= 0 {
			return "", errors.New("invalid proposal content")
		}
		tag = 1
		if p.Operation.Kind == "write_text" {
			if p.Precondition == nil || p.Precondition.Base == nil {
				return "", errors.New("trusted base required")
			}
			tag = 3
		}
	case "create_directory":
		if p.Operation.Content != nil {
			return "", errors.New("unexpected proposal content")
		}
		tag = 2
	default:
		return "", errors.New("unsupported proposal operation")
	}
	data := []byte("LATTICE_NATIVE_PROPOSAL\x00\x01")
	if p.Precondition != nil {
		data[len(data)-1] = 2
		if !validPrecondition(*p.Precondition, p.Operation.Kind) {
			return "", errors.New("invalid precondition")
		}
	}
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
	if p.Precondition != nil {
		field(p.Precondition.ParentIdentity.Volume)
		field(p.Precondition.ParentIdentity.File)
	}
	if p.Operation.Kind == "write_text" {
		base := p.Precondition.Base
		field("matches_base")
		field(base.Identity.Volume)
		field(base.Identity.File)
		field(base.ContentSHA3)
		data = binary.BigEndian.AppendUint64(data, uint64(base.ByteCount))
	} else {
		field("must_be_absent")
	}
	digest := sha3.Sum256(data)
	return hex.EncodeToString(digest[:]), nil
}

func validObjectIdentity(id fsutil.DirectoryIdentity) bool {
	_, v := hex.DecodeString(id.Volume)
	_, f := hex.DecodeString(id.File)
	return len(id.Volume) == 16 && (len(id.File) == 16 || len(id.File) == 32) && v == nil && f == nil && id.File != strings.Repeat("0", len(id.File))
}
func validPrecondition(p fsutil.FilePrecondition, kind string) bool {
	if !validObjectIdentity(p.ParentIdentity) {
		return false
	}
	if kind != "write_text" {
		return p.Base == nil
	}
	b := p.Base
	if b == nil || !validObjectIdentity(b.Identity) || b.ByteCount != len(b.Content) || len(b.Content) > fsutil.MaxLocalReadBytes || !utf8.ValidString(b.Content) || strings.ContainsRune(b.Content, 0) {
		return false
	}
	sum := sha3.Sum256([]byte(b.Content))
	return b.ContentSHA3 == hex.EncodeToString(sum[:])
}
