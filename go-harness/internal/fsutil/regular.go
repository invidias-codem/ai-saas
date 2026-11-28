package fsutil

import (
	"errors"
	"io"
	"os"
)

const MaxLocalReadBytes = 256 * 1024

var ErrLocalFileTooLarge = errors.New("file too large for local tool read")

// OpenRegularFile never truncates before checking the opened descriptor.
// Nonblocking opens keep a workspace FIFO from hanging grant revocation.
func OpenRegularFile(root *os.Root, name string, flags int) (*os.File, error) {
	f, err := root.OpenFile(name, flags|nonblockFlag, 0600)
	if err != nil {
		return nil, err
	}
	info, err := f.Stat()
	if err != nil || !info.Mode().IsRegular() {
		_ = f.Close()
		return nil, errors.New("only regular files are supported")
	}
	return f, nil
}

func ReadRegularFile(root *os.Root, name string, limit int64) ([]byte, error) {
	f, err := OpenRegularFile(root, name, os.O_RDONLY)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	content, err := io.ReadAll(io.LimitReader(f, limit+1))
	if err != nil {
		return nil, err
	}
	if int64(len(content)) > limit {
		return nil, ErrLocalFileTooLarge
	}
	return content, nil
}

func WriteRegularFile(root *os.Root, name string, content []byte) error {
	if len(content) > MaxLocalReadBytes {
		return errors.New("file content exceeds local tool limit")
	}
	f, err := OpenRegularFile(root, name, os.O_WRONLY|os.O_CREATE)
	if err != nil {
		return err
	}
	defer f.Close()
	if err := f.Truncate(0); err != nil {
		return err
	}
	_, err = f.Write(content)
	return err
}
