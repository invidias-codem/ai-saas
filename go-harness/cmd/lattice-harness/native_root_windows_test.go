package main

import (
	"errors"
	"golang.org/x/sys/windows"
)

func pinnedRootBlocksRename(err error) bool { return errors.Is(err, windows.ERROR_SHARING_VIOLATION) }
