package nativeprotocol

import (
	"crypto/sha3"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"github.com/invidias-codem/ai-saas/go-harness/internal/fsutil"
	"slices"
	"strings"
	"unicode/utf8"
)

func validHex(value string, length int) bool {
	if len(value) != length {
		return false
	}
	for _, c := range value {
		if !(c >= '0' && c <= '9' || c >= 'a' && c <= 'f') {
			return false
		}
	}
	return true
}
func (b ProviderBinding) valid() bool {
	if b.ID == "unavailable" {
		return b.Revision == 0 && b.Qualification == ""
	}
	if b.ID == "" || len(b.ID) > 64 || b.Revision == 0 || !validHex(b.Qualification, 64) {
		return false
	}
	for _, c := range b.ID {
		if !(c >= 'a' && c <= 'z' || c >= '0' && c <= '9' || c == '-') {
			return false
		}
	}
	return true
}
func (p CommandPrecondition) validFor(op ProposalOperation) bool {
	if op.Kind != "execute_command" || op.Content != nil || op.Command == nil || !op.Command.valid() || op.TimeoutSeconds == nil || *op.TimeoutSeconds == 0 || *op.TimeoutSeconds > 120 {
		return false
	}
	if _, err := fsutil.NativeRelativePath(op.RelativePath); err != nil {
		return false
	}
	_, args, err := op.Command.launchArgs(p.Platform)
	return err == nil && p.Shell == op.Command.Shell && validObjectIdentity(p.CwdIdentity) && validObjectIdentity(p.Executable.Identity) && p.Executable.Path != "" && len(p.Executable.Path) <= 32768 && utf8.ValidString(p.Executable.Path) && !strings.ContainsRune(p.Executable.Path, 0) && validHex(p.Executable.ContentSHA3, 64) && p.Executable.ByteCount >= 4 && p.Executable.ByteCount <= executableBytes && slices.Equal(args, p.Argv) && p.TimeoutMS == commandTimeout(op.TimeoutSeconds) && p.OutputLimit == commandOutputBytes && p.EnvironmentPolicy == commandEnvironment && p.Requirements == commandRequirements && p.RequiresSandbox && p.Provider.valid()
}
func commandDigest(p ProposalMaterial) (string, error) {
	if p.Precondition != nil || p.CommandPrecondition == nil || !p.CommandPrecondition.validFor(p.Operation) {
		return "", errors.New("invalid command binding")
	}
	c := p.Operation.Command
	pre := p.CommandPrecondition
	data := []byte("LATTICE_NATIVE_PROPOSAL\x00\x03")
	field := func(value string) {
		data = binary.BigEndian.AppendUint32(data, uint32(len(value)))
		data = append(data, []byte(value)...)
	}
	fields := func(values []string) {
		data = binary.BigEndian.AppendUint32(data, uint32(len(values)))
		for _, v := range values {
			field(v)
		}
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
	data = append(data, 4)
	field(p.Operation.RelativePath)
	field(c.Shell)
	if c.Shell == "direct" {
		field(*c.Executable)
		fields(*c.Argv)
	} else {
		field(*c.Script)
	}
	for _, v := range []string{pre.Platform, pre.CwdIdentity.Volume, pre.CwdIdentity.File, pre.Executable.Path, pre.Executable.Identity.Volume, pre.Executable.Identity.File, pre.Executable.ContentSHA3} {
		field(v)
	}
	data = binary.BigEndian.AppendUint64(data, uint64(pre.Executable.ByteCount))
	fields(pre.Argv)
	data = binary.BigEndian.AppendUint32(data, pre.TimeoutMS)
	data = binary.BigEndian.AppendUint32(data, pre.OutputLimit)
	field(pre.EnvironmentPolicy)
	field(pre.Requirements)
	field(pre.Provider.ID)
	data = binary.BigEndian.AppendUint64(data, pre.Provider.Revision)
	field(pre.Provider.Qualification)
	data = append(data, 1)
	sum := sha3.Sum256(data)
	return hex.EncodeToString(sum[:]), nil
}
