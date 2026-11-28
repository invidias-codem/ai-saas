package fsutil

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
)

// NativeDirectory is a preparation pin, not permission to launch a process.
// Providers receive live handles only while the current registry lock is held.
type NativeDirectory struct {
	Root     *os.Root
	Identity DirectoryIdentity
	Grant    RootGrant
}

func (d *NativeDirectory) Close() { _ = d.Root.Close() }

type NativeExecutionRoot struct {
	Grant    RootGrant
	Root     *os.Root
	Identity DirectoryIdentity
}
type NativeExecutionScope struct {
	Cwd         *os.Root
	CwdIdentity DirectoryIdentity
	Roots       []NativeExecutionRoot
}

func pinCommandDirectory(p GrantedPath) (*os.Root, error) {
	if !mutationRootMatches(p) {
		return nil, errors.New("selected root changed")
	}
	current, err := p.Root.OpenRoot(".")
	if err != nil {
		return nil, err
	}
	if p.Name == "." {
		return current, nil
	}
	for _, part := range strings.Split(filepath.ToSlash(p.Name), "/") {
		f, e := openMutationObject(current, part, false, true)
		if e != nil {
			_ = current.Close()
			return nil, e
		}
		before, _, e := mutationObjectIdentity(f)
		next, openErr := current.OpenRoot(part)
		_ = f.Close()
		_ = current.Close()
		if e != nil || openErr != nil {
			if next != nil {
				_ = next.Close()
			}
			return nil, errors.New("cwd unavailable")
		}
		after, e := ReadDirectoryIdentity(next)
		if e != nil || before != after {
			_ = next.Close()
			return nil, errors.New("cwd changed")
		}
		current = next
	}
	return current, nil
}
func (r *RootRegistry) PrepareNativeDirectory(user, workspace, id, path string) (*NativeDirectory, error) {
	var result *NativeDirectory
	err := r.WithGrantedRelativePath(user, workspace, id, path, func(p GrantedPath) error {
		root, err := pinCommandDirectory(p)
		if err != nil {
			return err
		}
		identity, err := ReadDirectoryIdentity(root)
		if err != nil {
			_ = root.Close()
			return err
		}
		result = &NativeDirectory{Root: root, Identity: identity, Grant: p.Grant}
		return nil
	})
	return result, err
}

// Hold all current permission handles through provider admission, execution and
// confirmed descendant cleanup. A cwd path is never used as containment proof.
func (r *RootRegistry) WithNativeExecutionScope(user, workspace, id, path string, expected DirectoryIdentity, run func(NativeExecutionScope) error) error {
	return r.WithGrantedRelativePath(user, workspace, id, path, func(p GrantedPath) error {
		cwd, err := pinCommandDirectory(p)
		if err != nil {
			return err
		}
		defer cwd.Close()
		identity, err := ReadDirectoryIdentity(cwd)
		if err != nil || identity != expected {
			return errors.New("cwd changed")
		}
		scope := NativeExecutionScope{Cwd: cwd, CwdIdentity: identity}
		for i, grant := range r.grants {
			if grant.UserID != user || grant.WorkspaceID != workspace {
				continue
			}
			if !mutationRootMatches(GrantedPath{Root: r.roots[i], Grant: grant}) {
				return errors.New("permission root changed")
			}
			id, err := ReadDirectoryIdentity(r.roots[i])
			if err != nil {
				return err
			}
			scope.Roots = append(scope.Roots, NativeExecutionRoot{Grant: grant, Root: r.roots[i], Identity: id})
		}
		return run(scope)
	})
}

// Executable identities use the same full OS object identifiers as directory
// grants. Multiple hardlinks are valid for system executable installations.
func NativeFileIdentity(f *os.File) (DirectoryIdentity, error) {
	id, _, err := mutationObjectIdentity(f)
	return id, err
}

// The resolver supplies an absolute canonical path. Opening only its final
// component through the pinned parent refuses links and blocking pipe opens.
func OpenNativeExecutable(path string) (*os.File, error) {
	if !filepath.IsAbs(path) {
		return nil, errors.New("absolute executable required")
	}
	root, err := os.OpenRoot(filepath.Dir(path))
	if err != nil {
		return nil, err
	}
	defer root.Close()
	return openMutationObject(root, filepath.Base(path), false, false)
}
