package fsutil

import (
	"encoding/hex"
	"errors"
	"fmt"
	"golang.org/x/sys/windows"
	"os"
	"strings"
	"unsafe"
)

// NtCreateFile binds a validated single component to an already pinned parent.
// A reparse point is opened as the link itself and then refused. During writes
// deny other write/delete handles instead of relying on path-based truncation.
func openMutationObject(root *os.Root, leaf string, write, directory bool) (*os.File, error) {
	if leaf == "" || leaf == "." || leaf == ".." || strings.ContainsAny(leaf, `/\:`) {
		return nil, errors.New("single leaf required")
	}
	parent, err := root.Open(".")
	if err != nil {
		return nil, err
	}
	defer parent.Close()
	name, err := windows.NewNTUnicodeString(leaf)
	if err != nil {
		return nil, err
	}
	oa := windows.OBJECT_ATTRIBUTES{Length: uint32(unsafe.Sizeof(windows.OBJECT_ATTRIBUTES{})), RootDirectory: windows.Handle(parent.Fd()), ObjectName: name, Attributes: windows.OBJ_CASE_INSENSITIVE}
	access := uint32(windows.GENERIC_READ | windows.SYNCHRONIZE)
	share := uint32(windows.FILE_SHARE_READ | windows.FILE_SHARE_WRITE | windows.FILE_SHARE_DELETE)
	if write {
		access |= windows.GENERIC_WRITE
		share = windows.FILE_SHARE_READ
	}
	options := uint32(windows.FILE_OPEN_REPARSE_POINT | windows.FILE_SYNCHRONOUS_IO_NONALERT | windows.FILE_NON_DIRECTORY_FILE)
	if directory {
		options = windows.FILE_OPEN_REPARSE_POINT | windows.FILE_SYNCHRONOUS_IO_NONALERT | windows.FILE_DIRECTORY_FILE
	}
	var handle windows.Handle
	var status windows.IO_STATUS_BLOCK
	if err = windows.NtCreateFile(&handle, access, &oa, &status, nil, 0, share, windows.FILE_OPEN, options, 0, 0); err != nil {
		return nil, err
	}
	f := os.NewFile(uintptr(handle), leaf)
	var attributes struct {
		Attributes uint32
		Tag        uint32
	}
	if err = windows.GetFileInformationByHandleEx(handle, windows.FileAttributeTagInfo, (*byte)(unsafe.Pointer(&attributes)), uint32(unsafe.Sizeof(attributes))); err != nil || attributes.Attributes&windows.FILE_ATTRIBUTE_REPARSE_POINT != 0 {
		_ = f.Close()
		return nil, errors.New("reparse point unavailable")
	}
	return f, nil
}
func mutationObjectIdentity(f *os.File) (DirectoryIdentity, uint64, error) {
	var id struct {
		Volume uint64
		File   [16]byte
	}
	if err := windows.GetFileInformationByHandleEx(windows.Handle(f.Fd()), windows.FileIdInfo, (*byte)(unsafe.Pointer(&id)), uint32(unsafe.Sizeof(id))); err != nil {
		return DirectoryIdentity{}, 0, err
	}
	if id.File == ([16]byte{}) {
		return DirectoryIdentity{}, 0, errors.New("file identity unavailable")
	}
	var info windows.ByHandleFileInformation
	if err := windows.GetFileInformationByHandle(windows.Handle(f.Fd()), &info); err != nil {
		return DirectoryIdentity{}, 0, err
	}
	return DirectoryIdentity{Volume: fmt.Sprintf("%016x", id.Volume), File: hex.EncodeToString(id.File[:])}, uint64(info.NumberOfLinks), nil
}
