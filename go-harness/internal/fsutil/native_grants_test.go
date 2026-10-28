package fsutil

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestNativeRelativePathsRejectPortableEscapeForms(t *testing.T) {
	data, err := os.ReadFile("../../../testdata/native-relative-paths.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixtures struct {
		Valid   []string `json:"valid"`
		Invalid []string `json:"invalid"`
	}
	if err := json.Unmarshal(data, &fixtures); err != nil {
		t.Fatal(err)
	}
	for _, name := range fixtures.Invalid {
		if _, err := NativeRelativePath(name); err == nil {
			t.Errorf("accepted %q", name)
		}
	}
	for _, name := range fixtures.Valid {
		if _, err := NativeRelativePath(name); err != nil {
			t.Errorf("rejected %q: %v", name, err)
		}
	}
}

func TestNativeRevocationWaitsForAdmittedDescriptorOperations(t *testing.T) {
	dir := t.TempDir()
	root, err := os.OpenRoot(dir)
	if err != nil {
		t.Fatal(err)
	}
	defer root.Close()
	identity, err := ReadDirectoryIdentity(root)
	if err != nil {
		t.Fatal(err)
	}
	registry := NewRootRegistry()
	defer registry.Close()
	if err := registry.UpdateReadGrants("user", "workspace", []ReadGrant{{ID: "selected", Path: dir, Identity: identity}}); err != nil {
		t.Fatal(err)
	}
	admitted := make(chan struct{})
	release := make(chan struct{})
	readDone := make(chan error, 1)
	go func() {
		readDone <- registry.WithGrantedRelativePath("user", "workspace", "selected", ".", func(GrantedPath) error { close(admitted); <-release; return nil })
	}()
	<-admitted
	revoked := make(chan error, 1)
	go func() { revoked <- registry.UpdateReadGrants("user", "workspace", nil) }()
	select {
	case err := <-revoked:
		t.Fatalf("revocation acknowledged admitted work: %v", err)
	case <-time.After(30 * time.Millisecond):
	}
	close(release)
	select {
	case err := <-revoked:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(time.Second):
		t.Fatal("revocation did not finish")
	}
	if err := <-readDone; err != nil {
		t.Fatal(err)
	}
	if err := registry.WithGrantedRelativePath("user", "workspace", "selected", ".", func(GrantedPath) error { t.Fatal("read admitted after revocation"); return nil }); err == nil {
		t.Fatal("revoked grant accepted")
	}
}

func TestNativeGrantPinsIdentityAndRejectsWholeInvalidSnapshot(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "note.txt"), []byte("selected"), 0600); err != nil {
		t.Fatal(err)
	}
	root, err := os.OpenRoot(dir)
	if err != nil {
		t.Fatal(err)
	}
	defer root.Close()
	identity, err := ReadDirectoryIdentity(root)
	if err != nil {
		t.Fatal(err)
	}
	registry := NewRootRegistry()
	defer registry.Close()
	grants := []ReadGrant{{ID: "selected", Path: dir, Identity: identity}}
	if err := registry.UpdateReadGrants("user", "workspace", grants); err != nil {
		t.Fatal(err)
	}
	read := func(id string) (string, error) {
		var body []byte
		err := registry.WithGrantedRelativePath("user", "workspace", id, "note.txt", func(p GrantedPath) error {
			var err error
			body, err = ReadRegularFile(p.Root, p.Name, MaxLocalReadBytes)
			return err
		})
		return string(body), err
	}
	if body, err := read("selected"); err != nil || body != "selected" {
		t.Fatalf("read %q: %v", body, err)
	}
	if _, err := read("foreign"); err == nil {
		t.Fatal("foreign grant was admitted")
	}
	if err := registry.WithGrantedRelativePath("other", "workspace", "selected", "note.txt", func(GrantedPath) error { t.Fatal("foreign identity admitted"); return nil }); err == nil {
		t.Fatal("foreign identity accepted")
	}
	grants = append(grants, ReadGrant{ID: "missing", Path: filepath.Join(dir, "absent"), Identity: identity})
	if err := registry.UpdateReadGrants("user", "workspace", grants); err == nil {
		t.Fatal("partial snapshot installed")
	}
	if body, err := read("selected"); err != nil || body != "selected" {
		t.Fatalf("old snapshot changed %q: %v", body, err)
	}
	if err := registry.UpdateReadGrants("user", "workspace", nil); err != nil {
		t.Fatal(err)
	}
	if _, err := read("selected"); err == nil {
		t.Fatal("revoked grant was admitted")
	}
}
