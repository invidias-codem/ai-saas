package harness

import (
	"context"
	"encoding/base64"
	"errors"
	"github.com/invidias-codem/ai-saas/go-harness/internal/fsutil"
	"github.com/invidias-codem/ai-saas/go-harness/internal/netguard"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

type CrawlerConfig struct {
	WorkspaceID  string
	RepoFullName string
	AuthToken    string
	APIBaseURL   string
	GitHubToken  string
}

// Ignore list for standard noisy directories and files
var ignoredDirs = map[string]bool{
	".git":         true,
	"node_modules": true,
	"dist":         true,
	"build":        true,
	"vendor":       true,
	".next":        true,
	"__pycache__":  true,
}

var ignoredExtensions = map[string]bool{
	".png": true, ".jpg": true, ".jpeg": true, ".gif": true, ".svg": true, ".ico": true,
	".mp4": true, ".mp3": true, ".pdf": true, ".zip": true, ".tar": true, ".gz": true,
	".wasm": true, ".bin": true, ".exe": true, ".dll": true, ".so": true, ".dylib": true,
	".lock": true,
}

// cloneCommand keeps credentials out of argv and .git/config. Git receives
// host-scoped authentication through its transient config environment only.
func cloneCommand(ctx context.Context, config CrawlerConfig, dir string) (*exec.Cmd, error) {
	parts := strings.Split(config.RepoFullName, "/")
	if len(parts) != 2 || !repoPart.MatchString(parts[0]) || !repoPart.MatchString(parts[1]) || parts[0] == "." || parts[0] == ".." || parts[1] == "." || parts[1] == ".." {
		return nil, errors.New("invalid repository identity")
	}
	if strings.ContainsAny(config.GitHubToken, "\r\n\x00") {
		return nil, errors.New("invalid GitHub credential")
	}
	cmd := exec.CommandContext(ctx, "git", "clone", "--depth", "1", "--", "https://github.com/"+config.RepoFullName+".git", dir)
	for _, key := range []string{"PATH", "SystemRoot", "WINDIR", "TMP", "TEMP", "LANG", "LC_ALL"} {
		if value := os.Getenv(key); value != "" {
			cmd.Env = append(cmd.Env, key+"="+value)
		}
	}
	header := ""
	if config.GitHubToken != "" {
		header = "Authorization: Basic " + base64.StdEncoding.EncodeToString([]byte("x-access-token:"+config.GitHubToken))
	}
	cmd.Env = append(cmd.Env, "GIT_TERMINAL_PROMPT=0", "GIT_CONFIG_NOSYSTEM=1", "GIT_CONFIG_GLOBAL="+os.DevNull,
		"GIT_CONFIG_COUNT=6", "GIT_CONFIG_KEY_0=credential.helper", "GIT_CONFIG_VALUE_0=",
		"GIT_CONFIG_KEY_1=http.https://github.com/.extraHeader", "GIT_CONFIG_VALUE_1="+header,
		"GIT_CONFIG_KEY_2=protocol.allow", "GIT_CONFIG_VALUE_2=never",
		"GIT_CONFIG_KEY_3=protocol.https.allow", "GIT_CONFIG_VALUE_3=always",
		"GIT_CONFIG_KEY_4=core.hooksPath", "GIT_CONFIG_VALUE_4="+filepath.Join(dir, ".no-hooks"),
		"GIT_CONFIG_KEY_5=init.templateDir", "GIT_CONFIG_VALUE_5="+filepath.Join(dir, ".no-templates"))
	return cmd, nil
}

func CrawlAndIngest(config CrawlerConfig) error {
	if _, err := netguard.APIURL(config.APIBaseURL, config.WorkspaceID, "ingest"); err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()
	dir, err := os.MkdirTemp("", "lattice-crawler-*")
	if err != nil {
		return errors.New("cannot prepare repository clone")
	}
	defer os.RemoveAll(dir)
	cmd, err := cloneCommand(ctx, config, dir)
	if err != nil {
		return err
	}
	if err := cmd.Run(); err != nil {
		return errors.New("repository clone failed")
	}
	root, err := os.OpenRoot(dir)
	if err != nil {
		return err
	}
	defer root.Close()
	client := NewIngestClient(config.WorkspaceID, config.RepoFullName, config.AuthToken, config.APIBaseURL)
	count := 0
	err = fs.WalkDir(root.FS(), ".", func(name string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if err := ctx.Err(); err != nil {
			return err
		}
		count++
		if count > 10000 {
			return errors.New("repository exceeds crawler entry limit")
		}
		if entry.Type()&os.ModeSymlink != 0 {
			return nil
		}
		if entry.IsDir() {
			if ignoredDirs[entry.Name()] {
				return fs.SkipDir
			}
			return nil
		}
		if ignoredExtensions[strings.ToLower(filepath.Ext(name))] {
			return nil
		}
		content, err := fsutil.ReadRegularFile(root, filepath.FromSlash(name), MaxExtractFileSize)
		if err != nil || bytesContainNull(content) {
			return nil
		}
		for _, chunk := range ChunkFile(name, string(content)) {
			if err := client.AddChunk(chunk); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return err
	}
	return client.Flush()
}

func bytesContainNull(b []byte) bool {
	for _, c := range b {
		if c == 0 {
			return true
		}
	}
	return false
}
