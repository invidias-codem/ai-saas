//go:build !windows

package fsutil

import (
	"fmt"
	"os"
	"syscall"
)

func ReadDirectoryIdentity(root *os.Root) (DirectoryIdentity, error) {
	info, err := root.Stat(".")
	if err != nil {
		return DirectoryIdentity{}, err
	}
	stat, ok := info.Sys().(*syscall.Stat_t)
	if !ok || !info.IsDir() {
		return DirectoryIdentity{}, fmt.Errorf("directory identity unavailable")
	}
	return DirectoryIdentity{Volume: fmt.Sprintf("%016x", uint64(stat.Dev)), File: fmt.Sprintf("%016x", uint64(stat.Ino))}, nil
}
