package fsutil

import "sync"

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
