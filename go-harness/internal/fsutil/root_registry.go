package fsutil

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

type RootRegistry struct {
	grants []RootGrant
	roots  []*os.Root
	mutex  sync.RWMutex
}

func NewRootRegistry() *RootRegistry {
	return &RootRegistry{
		grants: make([]RootGrant, 0),
	}
}

// UpdateGrants hydrates the in-memory registry of authorized roots.
func (r *RootRegistry) UpdateGrants(grants []RootGrant) error {
	if len(grants) > 128 {
		return errors.New("too many root grants")
	}
	// Pin directories at the trusted grant-install boundary. Reopening a grant's
	// path for each operation would let a renamed/replaced directory change its
	// authority. Prepare the entire snapshot before replacing the previous one.
	prepared := make([]RootGrant, len(grants))
	roots := make([]*os.Root, 0, len(grants))
	for i, grant := range grants {
		if strings.TrimSpace(grant.UserID) == "" || !filepath.IsAbs(grant.Path) {
			for _, root := range roots {
				_ = root.Close()
			}
			return errors.New("grants require a user identity and an absolute directory")
		}
		grant.Path = filepath.Clean(grant.Path)
		root, err := os.OpenRoot(grant.Path)
		if err != nil {
			for _, root := range roots {
				_ = root.Close()
			}
			return fmt.Errorf("cannot open granted directory: %w", err)
		}
		roots = append(roots, root)
		prepared[i] = grant
	}
	r.mutex.Lock()
	defer r.mutex.Unlock()
	for _, root := range r.roots {
		_ = root.Close()
	}
	r.grants, r.roots = prepared, roots
	return nil
}

// Close revokes all grants and releases their directory handles.
func (r *RootRegistry) Close() error { return r.UpdateGrants(nil) }

type PathAccess struct {
	Path        string
	Write       bool
	Destructive bool
}

// GrantedPath is valid only during the WithGrantedPaths callback.
type GrantedPath struct {
	Root  *os.Root
	Name  string
	Grant RootGrant
}

// WithGrantedPaths admits an operation against one immutable grant snapshot.
// Revocation waits for admitted filesystem operations, then blocks later ones.
// Network requests must never execute while this callback holds the lock.
func (r *RootRegistry) WithGrantedPaths(userID, workspaceID string, paths []PathAccess, operation func([]GrantedPath) error) error {
	if strings.TrimSpace(userID) == "" || strings.TrimSpace(workspaceID) == "" {
		return errors.New("403 Forbidden: user and workspace identity are required")
	}
	r.mutex.RLock()
	defer r.mutex.RUnlock()
	resolved := make([]GrantedPath, 0, len(paths))
	for _, access := range paths {
		if !filepath.IsAbs(access.Path) {
			return errors.New("403 Forbidden: an absolute granted path is required")
		}
		best := -1
		for i, grant := range r.grants {
			if grant.UserID != userID || (grant.WorkspaceID != "" && grant.WorkspaceID != workspaceID) {
				continue
			}
			if contained, _ := IsPathContained(grant.Path, access.Path); contained && (best < 0 || len(grant.Path) > len(r.grants[best].Path)) {
				best = i
			}
		}
		if best < 0 {
			return errors.New("403 Forbidden: path is outside this user and workspace's grants")
		}
		grant := r.grants[best]
		if access.Write && grant.ReadOnly {
			return errors.New("403 Forbidden: root is explicitly Read-Only")
		}
		if access.Destructive && !grant.AllowDestructive {
			return errors.New("403 Forbidden: Destructive operations require explicit permission")
		}
		name, err := filepath.Rel(grant.Path, filepath.Clean(access.Path))
		if err != nil {
			return errors.New("403 Forbidden: invalid granted path")
		}
		if access.Write && name == "." {
			return errors.New("403 Forbidden: cannot mutate a granted root itself")
		}
		resolved = append(resolved, GrantedPath{Root: r.roots[best], Name: name, Grant: grant})
	}
	return operation(resolved)
}

// GetMatchingGrant finds the first authorized root grant that contains the given path.
func (r *RootRegistry) GetMatchingGrant(targetPath string) (*RootGrant, error) {
	r.mutex.RLock()
	defer r.mutex.RUnlock()

	for _, grant := range r.grants {
		contained, err := IsPathContained(grant.Path, targetPath)
		if err == nil && contained {
			// Found a matching grant
			matched := grant
			return &matched, nil
		}
	}
	return nil, nil // No match
}

// GetMatchingResolvedGrant compares existing directories in the same canonical
// namespace. Windows short paths and symlink/junction aliases must be resolved
// on both sides; resolving only the requested cwd rejects legitimate grants.
func (r *RootRegistry) GetMatchingResolvedGrant(targetPath string) (*RootGrant, error) {
	target, err := filepath.EvalSymlinks(targetPath)
	if err != nil {
		return nil, err
	}
	r.mutex.RLock()
	defer r.mutex.RUnlock()
	for _, grant := range r.grants {
		root, err := filepath.EvalSymlinks(grant.Path)
		if err != nil {
			continue // unavailable roots never authorize execution
		}
		contained, err := IsPathContained(root, target)
		if err == nil && contained {
			matched := grant
			return &matched, nil
		}
	}
	return nil, nil
}
