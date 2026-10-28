package fsutil

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"unicode"
	"unicode/utf8"
)

// DirectoryIdentity binds a native confirmation to the opened directory, not
// to whatever may later occupy its path. Values are nonsecret OS identifiers.
type DirectoryIdentity struct {
	Volume string `json:"volume"`
	File   string `json:"file"`
}

type ReadGrant struct {
	ID       string            `json:"grant_id"`
	Path     string            `json:"path"`
	Identity DirectoryIdentity `json:"directory_identity"`
}

// NativeRelativePath uses portable forward-slash paths. Reject ambiguous
// Windows spellings on every platform instead of reinterpreting them later.
func NativeRelativePath(name string) (string, error) {
	invalid := errors.New("invalid native relative path")
	if name == "" || len(name) > 4096 || !utf8.ValidString(name) || strings.ContainsAny(name, `\:<>"|?*`) {
		return "", invalid
	}
	for _, c := range name {
		if unicode.IsControl(c) || c >= 0x202a && c <= 0x202e || c >= 0x2066 && c <= 0x2069 {
			return "", invalid
		}
	}
	if name == "." {
		return name, nil
	}
	for _, part := range strings.Split(name, "/") {
		if part == "" || part == "." || part == ".." || strings.TrimRight(part, " .") != part {
			return "", invalid
		}
		base := strings.TrimRight(strings.ToUpper(strings.SplitN(part, ".", 2)[0]), " ")
		deviceSuffix := strings.TrimPrefix(strings.TrimPrefix(base, "COM"), "LPT")
		devicePort := (strings.HasPrefix(base, "COM") || strings.HasPrefix(base, "LPT")) && strings.Contains("123456789¹²³", deviceSuffix) && len([]rune(deviceSuffix)) == 1
		if base == "CON" || base == "PRN" || base == "AUX" || base == "NUL" || base == "CLOCK$" || base == "CONIN$" || base == "CONOUT$" || devicePort {
			return "", invalid
		}
	}
	local := filepath.FromSlash(name)
	if !filepath.IsLocal(local) {
		return "", invalid
	}
	return local, nil
}

// UpdateReadGrants commits a complete read-only snapshot. Existing IDs retain
// their pinned handles, including after a root is renamed or replaced. Failed
// preparation changes no registry state; the native session then blocks access.
func (r *RootRegistry) UpdateReadGrants(user, workspace string, grants []ReadGrant) error {
	if user == "" || workspace == "" || len(grants) > 32 {
		return errors.New("invalid native grants")
	}
	r.mutex.Lock()
	defer r.mutex.Unlock()
	prepared := make([]RootGrant, 0, len(grants))
	roots := make([]*os.Root, 0, len(grants))
	opened := make([]*os.Root, 0, len(grants))
	committed := false
	defer func() {
		if !committed {
			for _, root := range opened {
				_ = root.Close()
			}
		}
	}()
	seen := make(map[string]bool, len(grants))
	for _, grant := range grants {
		if grant.ID == "" || seen[grant.ID] || !filepath.IsAbs(grant.Path) {
			return errors.New("invalid native grant")
		}
		seen[grant.ID] = true
		var root *os.Root
		for i, old := range r.grants {
			if old.ID == grant.ID {
				if old.UserID != user || old.WorkspaceID != workspace || old.Path != grant.Path || !old.ReadOnly || old.AllowDestructive {
					return errors.New("native grant replacement denied")
				}
				root = r.roots[i]
				break
			}
		}
		if root == nil {
			var err error
			root, err = os.OpenRoot(grant.Path)
			if err != nil {
				return errors.New("native directory unavailable")
			}
			opened = append(opened, root)
		}
		identity, err := ReadDirectoryIdentity(root)
		if err != nil || identity != grant.Identity {
			return errors.New("native directory identity changed")
		}
		prepared = append(prepared, RootGrant{ID: grant.ID, UserID: user, WorkspaceID: workspace, Path: grant.Path, ReadOnly: true})
		roots = append(roots, root)
	}
	retained := make(map[*os.Root]bool, len(roots))
	for _, root := range roots {
		retained[root] = true
	}
	for _, root := range r.roots {
		if !retained[root] {
			_ = root.Close()
		}
	}
	r.grants, r.roots = prepared, roots
	committed = true
	return nil
}

// WithGrantedRelativePath cannot fall back to another grant containing a path.
// Keep the registry lock through the descriptor operation so revocation waits.
func (r *RootRegistry) WithGrantedRelativePath(user, workspace, id, relative string, operation func(GrantedPath) error) error {
	name, err := NativeRelativePath(relative)
	if err != nil {
		return err
	}
	if user == "" || workspace == "" || id == "" {
		return errors.New("native grant denied")
	}
	r.mutex.RLock()
	defer r.mutex.RUnlock()
	for i, grant := range r.grants {
		if grant.ID == id && grant.UserID == user && grant.WorkspaceID == workspace {
			return operation(GrantedPath{Root: r.roots[i], Name: name, Grant: grant})
		}
	}
	return errors.New("native grant denied")
}

func OpenDirectory(root *os.Root, name string) (*os.File, error) {
	f, err := root.OpenFile(name, os.O_RDONLY|nonblockFlag, 0)
	if err != nil {
		return nil, err
	}
	info, err := f.Stat()
	if err != nil || !info.IsDir() {
		_ = f.Close()
		return nil, errors.New("native directory required")
	}
	return f, nil
}
