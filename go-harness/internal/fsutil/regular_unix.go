//go:build !windows

package fsutil

import "golang.org/x/sys/unix"

const nonblockFlag = unix.O_NONBLOCK
