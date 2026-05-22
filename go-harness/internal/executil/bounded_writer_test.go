package executil

import (
	"strings"
	"testing"
)

func TestBoundedWriter(t *testing.T) {
	limit := 10
	w := NewBoundedWriter(limit)

	// Write smaller than limit
	n, err := w.Write([]byte("hello"))
	if err != nil {
		t.Errorf("expected no error, got %v", err)
	}
	if n != 5 {
		t.Errorf("expected 5 bytes written, got %d", n)
	}

	// Write exceeding limit
	_, err2 := w.Write([]byte(" world!"))
	if err2 != ErrOutputLimitExceeded {
		t.Errorf("expected ErrOutputLimitExceeded, got %v", err2)
	}
	// "hello" + " wo" = 10 bytes written, then truncation marker
	expectedPrefix := "hello wo"
	if !strings.HasPrefix(w.String(), expectedPrefix) {
		t.Errorf("expected output to start with %q, got %q", expectedPrefix, w.String())
	}
	if !strings.Contains(w.String(), "\n...[OUTPUT TRUNCATED DUE TO SIZE LIMIT]...\n") {
		t.Errorf("expected output to contain truncation marker, got %q", w.String())
	}
	if !w.IsTruncated() {
		t.Errorf("expected IsTruncated to be true")
	}

	// Additional writes should immediately fail and return 0
	n3, err3 := w.Write([]byte("extra"))
	if err3 != ErrOutputLimitExceeded {
		t.Errorf("expected ErrOutputLimitExceeded, got %v", err3)
	}
	if n3 != 0 {
		t.Errorf("expected 0 bytes written after truncation, got %d", n3)
	}
}
