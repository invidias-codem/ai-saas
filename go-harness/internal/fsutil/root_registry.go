package fsutil

import (
	"path/filepath"
	"sync"
)

type RootRegistry struct {
	grants []RootGrant
	mutex  sync.RWMutex
}

func NewRootRegistry() *RootRegistry {
	return &RootRegistry{
		grants: make([]RootGrant, 0),
	}
}

// UpdateGrants hydrates the in-memory registry of authorized roots.
func (r *RootRegistry) UpdateGrants(grants []RootGrant) {
	r.mutex.Lock()
	defer r.mutex.Unlock()
	r.grants = grants
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
