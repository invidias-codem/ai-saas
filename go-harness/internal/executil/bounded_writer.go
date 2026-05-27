package executil

import (
	"bytes"
	"errors"
	"sync"
)

// ErrOutputLimitExceeded is returned to signal size limit exceeded, breaking stdout/stderr pipes.
var ErrOutputLimitExceeded = errors.New("command terminated due to output size limit")

type BoundedWriter struct {
	mu        sync.Mutex
	buf       bytes.Buffer
	limit     int
	truncated bool
	marker    []byte
}

// NewBoundedWriter constructs a thread-safe BoundedWriter.
func NewBoundedWriter(limit int) *BoundedWriter {
	return &BoundedWriter{
		limit:  limit,
		marker: []byte("\n...[OUTPUT TRUNCATED DUE TO SIZE LIMIT]...\n"),
	}
}

func (w *BoundedWriter) Write(p []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()

	if w.truncated {
		return 0, ErrOutputLimitExceeded
	}

	currentLen := w.buf.Len()
	if currentLen >= w.limit {
		w.buf.Write(w.marker)
		w.truncated = true
		return 0, ErrOutputLimitExceeded
	}

	remaining := w.limit - currentLen
	if len(p) > remaining {
		w.buf.Write(p[:remaining])
		w.buf.Write(w.marker)
		w.truncated = true
		return remaining, ErrOutputLimitExceeded
	}

	n, err := w.buf.Write(p)
	return n, err
}

func (w *BoundedWriter) String() string {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.buf.String()
}

func (w *BoundedWriter) IsTruncated() bool {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.truncated
}
