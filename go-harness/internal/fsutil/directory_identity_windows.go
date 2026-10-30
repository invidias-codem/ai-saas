package fsutil

import (
	"encoding/hex"
	"fmt"
	"os"
	"unsafe"

	"golang.org/x/sys/windows"
)

func ReadDirectoryIdentity(root *os.Root) (DirectoryIdentity, error) {
	f, err := OpenDirectory(root, ".")
	if err != nil {
		return DirectoryIdentity{}, err
	}
	defer f.Close()
	// FILE_ID_INFO uses the full 128-bit ID; legacy 64-bit file indexes are
	// not guaranteed unique on ReFS. The live directory handle owns this call.
	var info struct {
		Volume uint64
		File   [16]byte
	}
	if err := windows.GetFileInformationByHandleEx(windows.Handle(f.Fd()), windows.FileIdInfo, (*byte)(unsafe.Pointer(&info)), uint32(unsafe.Sizeof(info))); err != nil {
		return DirectoryIdentity{}, err
	}
	if info.File == ([16]byte{}) {
		return DirectoryIdentity{}, fmt.Errorf("directory identity unavailable")
	}
	return DirectoryIdentity{Volume: fmt.Sprintf("%016x", info.Volume), File: hex.EncodeToString(info.File[:])}, nil
}
