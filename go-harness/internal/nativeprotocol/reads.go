package nativeprotocol

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"math"
	"os"
	"sort"
	"time"
	"unicode/utf8"

	"github.com/invidias-codem/ai-saas/go-harness/internal/fsutil"
)

type GrantSnapshot struct {
	NextRevision uint64             `json:"next_revision"`
	Grants       []fsutil.ReadGrant `json:"grants"`
}
type GrantAcknowledgement struct {
	ProtocolVersion uint32    `json:"protocol_version"`
	Authority       Authority `json:"authority"`
	GrantIDs        []string  `json:"grant_ids"`
}
type ReadRequest struct {
	GrantID      string `json:"grant_id"`
	RelativePath string `json:"relative_path"`
}
type TextRead struct {
	Content   string `json:"content"`
	ByteCount int    `json:"byte_count"`
}
type FileStat struct {
	Kind string `json:"kind"`
	Size int64  `json:"size"`
}
type DirectoryEntry struct {
	Name string `json:"name"`
	Kind string `json:"kind"`
}
type DirectoryList struct {
	Entries []DirectoryEntry `json:"entries"`
}

func (s *Session) Close() error {
	if s.ownWork {
		s.work.Stop()
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := s.work.Wait(ctx); err != nil {
			return err
		}
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.blocked = true
	s.invalidatePrepared()
	return s.registry.Close()
}

// An invalid control update from the current authority cannot leave a silently
// usable previous permission set. Other identities cannot poison the session.
func (s *Session) RejectGrantUpdate(candidate *Authority) string {
	s.mu.Lock()
	defer s.mu.Unlock()
	if code := s.check(candidate); code != "" {
		return code
	}
	s.blocked = true
	s.invalidatePrepared()
	_ = s.registry.Close()
	return "LOCAL_GRANT_UPDATE_FAILED"
}

func (s *Session) UpdateGrants(candidate *Authority, snapshot GrantSnapshot) (GrantAcknowledgement, string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if code := s.check(candidate); code != "" {
		return GrantAcknowledgement{}, code
	}
	valid := s.bound.GrantRevision < math.MaxUint64 && snapshot.NextRevision == s.bound.GrantRevision+1 && snapshot.Grants != nil && len(snapshot.Grants) <= 32
	for _, grant := range snapshot.Grants {
		valid = valid && validID(grant.ID, "local-grant-") && len(grant.Path) <= 32768 && utf8.ValidString(grant.Path)
	}
	s.invalidatePrepared()
	if !valid || s.registry.UpdateNativeGrants(s.bound.PrincipalID, s.bound.WorkspaceID, snapshot.Grants) != nil {
		s.blocked = true
		_ = s.registry.Close()
		return GrantAcknowledgement{}, "LOCAL_GRANT_UPDATE_FAILED"
	}
	s.bound.GrantRevision = snapshot.NextRevision
	ids := make([]string, 0, len(snapshot.Grants))
	for _, grant := range snapshot.Grants {
		ids = append(ids, grant.ID)
	}
	return GrantAcknowledgement{Version, *s.bound, ids}, ""
}

func fileKind(mode os.FileMode) string {
	switch {
	case mode.IsRegular():
		return "file"
	case mode.IsDir():
		return "directory"
	case mode&os.ModeSymlink != 0:
		return "symlink"
	default:
		return "other"
	}
}

// Keep session and registry read locks through the entire descriptor read.
// A queued snapshot writer closes admission and waits for these operations.
func (s *Session) Read(ctx context.Context, candidate *Authority, action string, req ReadRequest) (any, string) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if code := s.check(candidate); code != "" {
		return nil, code
	}
	if _, err := fsutil.NativeRelativePath(req.RelativePath); err != nil {
		return nil, "LOCAL_PATH_INVALID"
	}
	if !validID(req.GrantID, "local-grant-") {
		return nil, "LOCAL_GRANT_DENIED"
	}
	if ctx.Err() != nil {
		return nil, "LOCAL_READ_FAILED"
	}
	var result any
	code := "LOCAL_GRANT_DENIED"
	err := s.registry.WithGrantedRelativePath(s.bound.PrincipalID, s.bound.WorkspaceID, req.GrantID, req.RelativePath, func(p fsutil.GrantedPath) error {
		code = "LOCAL_READ_FAILED"
		switch action {
		case "native_read_text":
			content, err := fsutil.ReadRegularFile(p.Root, p.Name, fsutil.MaxLocalReadBytes)
			if errors.Is(err, fsutil.ErrLocalFileTooLarge) {
				code = "LOCAL_FILE_TOO_LARGE"
			}
			if err != nil {
				return err
			}
			if !utf8.Valid(content) || bytes.IndexByte(content, 0) >= 0 {
				code = "LOCAL_TEXT_UNSUPPORTED"
				return errors.New("text required")
			}
			result = TextRead{string(content), len(content)}
		case "native_stat":
			info, err := p.Root.Stat(p.Name)
			if err != nil {
				return err
			}
			result = FileStat{fileKind(info.Mode()), info.Size()}
		case "native_list":
			dir, err := fsutil.OpenDirectory(p.Root, p.Name)
			if err != nil {
				return err
			}
			defer dir.Close()
			entries, err := dir.ReadDir(10001)
			if err != nil && err != io.EOF {
				return err
			}
			if len(entries) > 10000 {
				code = "LOCAL_DIRECTORY_TOO_LARGE"
				return errors.New("entry limit")
			}
			list := make([]DirectoryEntry, 0, len(entries))
			for _, entry := range entries {
				if !utf8.ValidString(entry.Name()) {
					code = "LOCAL_TEXT_UNSUPPORTED"
					return errors.New("text required")
				}
				list = append(list, DirectoryEntry{entry.Name(), fileKind(entry.Type())})
			}
			sort.Slice(list, func(i, j int) bool { return list[i].Name < list[j].Name })
			result = DirectoryList{list}
			encoded, err := json.Marshal(result)
			if err != nil {
				return err
			}
			if len(encoded) > 1024*1024 {
				code = "LOCAL_DIRECTORY_TOO_LARGE"
				return errors.New("response limit")
			}
		default:
			return errors.New("native read action denied")
		}
		return nil
	})
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			code = "LOCAL_FILE_NOT_FOUND"
		}
		return nil, code
	}
	if ctx.Err() != nil {
		return nil, "LOCAL_READ_FAILED"
	}
	return result, ""
}
