package fsutil

import (
	"bytes"
	"context"
	"crypto/sha3"
	"encoding/hex"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"unicode/utf8"
)

type FileBase struct {
	Identity    DirectoryIdentity `json:"identity"`
	ContentSHA3 string            `json:"content_sha3"`
	ByteCount   int               `json:"byte_count"`
	Content     string            `json:"content"`
}
type FilePrecondition struct {
	ParentIdentity DirectoryIdentity `json:"parent_identity"`
	Base           *FileBase         `json:"base,omitempty"`
}
type PreparedTarget struct {
	Precondition FilePrecondition
	DisplayRoot  string
	ReadOnly     bool
	parent       *os.Root
	base         *os.File
	once         sync.Once
}

func (p *PreparedTarget) Close() {
	p.once.Do(func() {
		if p.base != nil {
			_ = p.base.Close()
		}
		if p.parent != nil {
			_ = p.parent.Close()
		}
	})
}

type MutationResult struct {
	Code           string
	MayHaveChanged bool
}

func contentHash(content []byte) string {
	sum := sha3.Sum256(content)
	return hex.EncodeToString(sum[:])
}

// Reads may survive a renamed root, but mutation reviews must still describe
// the selected directory. Checking this path never replaces the pinned root.
func mutationRootMatches(p GrantedPath) bool {
	current, err := os.OpenRoot(p.Grant.Path)
	if err != nil {
		return false
	}
	defer current.Close()
	a, e1 := ReadDirectoryIdentity(p.Root)
	b, e2 := ReadDirectoryIdentity(current)
	return e1 == nil && e2 == nil && a == b
}

// Caller holds the registry lock. Compare actual directory identities along
// the walk with read-only roots, including roots moved within a writable grant.
func (r *RootRegistry) mutationParent(p GrantedPath, write bool) (*os.Root, string, error) {
	if p.Name == "." {
		return nil, "", errors.New("root mutation denied")
	}
	parts := strings.Split(filepath.ToSlash(p.Name), "/")
	current, err := p.Root.OpenRoot(".")
	if err != nil {
		return nil, "", err
	}
	denyReadOnly := func(root *os.Root) bool {
		id, e := ReadDirectoryIdentity(root)
		if e != nil {
			return true
		}
		for i, g := range r.grants {
			if g.UserID != p.Grant.UserID || g.WorkspaceID != p.Grant.WorkspaceID || !g.ReadOnly {
				continue
			}
			ro, e := ReadDirectoryIdentity(r.roots[i])
			if e != nil || id == ro {
				return true
			}
		}
		return false
	}
	if write && denyReadOnly(current) {
		_ = current.Close()
		return nil, "", errors.New("read-only directory")
	}
	for _, part := range parts[:len(parts)-1] {
		f, e := openMutationObject(current, part, false, true)
		if e != nil {
			_ = current.Close()
			return nil, "", e
		}
		before, _, e := mutationObjectIdentity(f)
		next, openErr := current.OpenRoot(part)
		_ = f.Close()
		_ = current.Close()
		if e != nil || openErr != nil {
			if next != nil {
				_ = next.Close()
			}
			return nil, "", errors.New("directory unavailable")
		}
		after, e := ReadDirectoryIdentity(next)
		if e != nil || before != after || write && denyReadOnly(next) {
			_ = next.Close()
			return nil, "", errors.New("directory changed or read-only")
		}
		current = next
	}
	return current, parts[len(parts)-1], nil
}

func readMutationBase(f *os.File) (*FileBase, error) {
	before, err := f.Stat()
	if err != nil || !before.Mode().IsRegular() || before.Size() > MaxLocalReadBytes {
		return nil, errors.New("bounded regular file required")
	}
	id, links, err := mutationObjectIdentity(f)
	if err != nil || links != 1 {
		return nil, errors.New("single-link file required")
	}
	body, err := io.ReadAll(io.LimitReader(f, MaxLocalReadBytes+1))
	if err != nil || len(body) > MaxLocalReadBytes || !utf8.Valid(body) || bytes.IndexByte(body, 0) >= 0 {
		return nil, errors.New("bounded text required")
	}
	after, err := f.Stat()
	if err != nil || before.Size() != after.Size() || !before.ModTime().Equal(after.ModTime()) || int64(len(body)) != after.Size() {
		return nil, errors.New("file changed")
	}
	return &FileBase{Identity: id, ContentSHA3: contentHash(body), ByteCount: len(body), Content: string(body)}, nil
}

// Preparation has no side effects. Hold target handles for the review lifetime
// so an external unlink cannot recycle the reviewed file identity.
func (r *RootRegistry) PrepareNativeTarget(user, workspace, grant, path, kind string) (*PreparedTarget, string) {
	var target *PreparedTarget
	code := "LOCAL_GRANT_DENIED"
	err := r.WithGrantedRelativePath(user, workspace, grant, path, func(p GrantedPath) error {
		code = "LOCAL_FILE_CONFLICT"
		if !mutationRootMatches(p) {
			return errors.New("root changed")
		}
		parent, leaf, err := r.mutationParent(p, false)
		if err != nil {
			return err
		}
		prepared := &PreparedTarget{parent: parent, DisplayRoot: p.Grant.Path, ReadOnly: p.Grant.ReadOnly}
		ok := false
		defer func() {
			if !ok {
				prepared.Close()
			}
		}()
		prepared.Precondition.ParentIdentity, err = ReadDirectoryIdentity(parent)
		if err != nil {
			return err
		}
		switch kind {
		case "create_file", "create_directory":
			if _, err = parent.Lstat(leaf); !errors.Is(err, os.ErrNotExist) {
				return errors.New("target must be absent")
			}
		case "write_text":
			f, e := openMutationObject(parent, leaf, false, false)
			if e != nil {
				return e
			}
			prepared.base = f
			prepared.Precondition.Base, err = readMutationBase(f)
			if err != nil {
				return err
			}
		default:
			return errors.New("unsupported mutation")
		}
		target = prepared
		ok = true
		code = ""
		return nil
	})
	if err != nil {
		return nil, code
	}
	return target, ""
}

// Overwrites use a checked pinned descriptor, not path-based truncate/replace.
// This is not atomic compare-and-swap against other applications on Unix.
func (r *RootRegistry) ApplyNativeMutation(ctx context.Context, user, workspace, grant, path, kind, content string, pre FilePrecondition) MutationResult {
	result := MutationResult{Code: "LOCAL_GRANT_DENIED"}
	_ = r.WithGrantedRelativePath(user, workspace, grant, path, func(p GrantedPath) error {
		if p.Grant.ReadOnly {
			result.Code = "LOCAL_WRITE_GRANT_REQUIRED"
			return nil
		}
		result.Code = "LOCAL_FILE_CONFLICT"
		if !mutationRootMatches(p) {
			return nil
		}
		parent, leaf, err := r.mutationParent(p, true)
		if err != nil {
			return nil
		}
		defer parent.Close()
		id, err := ReadDirectoryIdentity(parent)
		if err != nil || id != pre.ParentIdentity {
			return nil
		}
		if ctx.Err() != nil {
			result.Code = "LOCAL_OPERATION_CANCELLED"
			return nil
		}
		unknown := func() { result = MutationResult{Code: "LOCAL_OUTCOME_UNKNOWN", MayHaveChanged: true} }
		switch kind {
		case "create_directory":
			if pre.Base != nil {
				return nil
			}
			if err = parent.Mkdir(leaf, 0700); err != nil {
				if !errors.Is(err, os.ErrExist) {
					unknown()
				}
				return nil
			}
			result = MutationResult{MayHaveChanged: true}
		case "create_file":
			if pre.Base != nil || len(content) > MaxLocalReadBytes || !utf8.ValidString(content) || strings.ContainsRune(content, 0) {
				return nil
			}
			f, e := parent.OpenFile(leaf, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
			if e != nil {
				if !errors.Is(e, os.ErrExist) {
					unknown()
				}
				return nil
			}
			unknown()
			n, e := f.WriteString(content)
			if e == nil && n == len(content) {
				e = f.Sync()
			}
			closeErr := f.Close()
			if e == nil && n == len(content) && closeErr == nil {
				result = MutationResult{MayHaveChanged: true}
			}
		case "write_text":
			if pre.Base == nil || len(content) > MaxLocalReadBytes || !utf8.ValidString(content) || strings.ContainsRune(content, 0) {
				return nil
			}
			f, e := openMutationObject(parent, leaf, true, false)
			if e != nil {
				return nil
			}
			defer f.Close()
			base, e := readMutationBase(f)
			if e != nil || *base != *pre.Base {
				return nil
			}
			named, e := openMutationObject(parent, leaf, false, false)
			if e != nil {
				return nil
			}
			namedID, links, e := mutationObjectIdentity(named)
			_ = named.Close()
			if e != nil || links != 1 || namedID != base.Identity {
				return nil
			}
			if ctx.Err() != nil {
				result.Code = "LOCAL_OPERATION_CANCELLED"
				return nil
			}
			unknown()
			n, e := f.WriteAt([]byte(content), 0)
			if e == nil && n == len(content) {
				e = f.Truncate(int64(len(content)))
			}
			if e == nil {
				e = f.Sync()
			}
			closeErr := f.Close()
			if e == nil && n == len(content) && closeErr == nil {
				result = MutationResult{MayHaveChanged: true}
			}
		}
		return nil
	})
	return result
}
