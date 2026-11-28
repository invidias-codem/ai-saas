//go:build !windows

package fsutil

import (
	"errors"
	"fmt"
	"golang.org/x/sys/unix"
	"os"
	"strings"
	"syscall"
)

// Every component is opened separately relative to a pinned directory. Refuse
// symlinks and nonblocking special files instead of following an alias.
func openMutationObject(root *os.Root, leaf string, write, directory bool) (*os.File, error) {
	if leaf == "" || leaf == "." || leaf == ".." || strings.ContainsAny(leaf, `/\:`) {
		return nil, errors.New("single leaf required")
	}
	parent, err := root.Open(".")
	if err != nil {
		return nil, err
	}
	defer parent.Close()
	// os.Root.OpenFile deliberately resolves an in-root symlink even if its
	// caller sets O_NOFOLLOW. Use openat on this pinned parent for a genuinely
	// no-follow single-component open; never accept a path or traversal here.
	flags := os.O_RDONLY | unix.O_NOFOLLOW | unix.O_NONBLOCK | unix.O_CLOEXEC
	if write {
		flags = os.O_RDWR | unix.O_NOFOLLOW | unix.O_NONBLOCK | unix.O_CLOEXEC
	}
	if directory {
		flags |= unix.O_DIRECTORY
	}
	fd, err := unix.Openat(int(parent.Fd()), leaf, flags, 0)
	if err != nil {
		return nil, err
	}
	return os.NewFile(uintptr(fd), leaf), nil
}
func mutationObjectIdentity(f *os.File) (DirectoryIdentity, uint64, error) {
	var st syscall.Stat_t
	if err := syscall.Fstat(int(f.Fd()), &st); err != nil {
		return DirectoryIdentity{}, 0, err
	}
	return DirectoryIdentity{Volume: fmt.Sprintf("%016x", uint64(st.Dev)), File: fmt.Sprintf("%016x", uint64(st.Ino))}, uint64(st.Nlink), nil
}
