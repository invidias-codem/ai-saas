//go:build !windows

package fsutil

import (
	"fmt"
	"golang.org/x/sys/unix"
	"os"
	"syscall"
)

// Every component is opened separately relative to a pinned directory. Refuse
// symlinks and nonblocking special files instead of following an alias.
func openMutationObject(root *os.Root, leaf string, write, directory bool) (*os.File, error) {
	flags := os.O_RDONLY | unix.O_NOFOLLOW | unix.O_NONBLOCK
	if write {
		flags = os.O_RDWR | unix.O_NOFOLLOW | unix.O_NONBLOCK
	}
	if directory {
		flags |= unix.O_DIRECTORY
	}
	return root.OpenFile(leaf, flags, 0)
}
func mutationObjectIdentity(f *os.File) (DirectoryIdentity, uint64, error) {
	var st syscall.Stat_t
	if err := syscall.Fstat(int(f.Fd()), &st); err != nil {
		return DirectoryIdentity{}, 0, err
	}
	return DirectoryIdentity{Volume: fmt.Sprintf("%016x", uint64(st.Dev)), File: fmt.Sprintf("%016x", uint64(st.Ino))}, uint64(st.Nlink), nil
}
