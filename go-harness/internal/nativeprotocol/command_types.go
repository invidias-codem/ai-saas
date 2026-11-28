package nativeprotocol

import (
	"crypto/sha3"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"github.com/invidias-codem/ai-saas/go-harness/internal/fsutil"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"unicode/utf16"
	"unicode/utf8"
)

const commandBytes = 64 * 1024
const commandOutputBytes = 10 * 1024
const executableBytes = 64 * 1024 * 1024
const commandEnvironment = "native-clean-v1"
const commandRequirements = "native-local-sandbox-v1"

// Closed effective input: there is no env, PATH, approval, executable path or
// caller assertion of isolation. Direct arguments are never split as a string.
type CommandInput struct {
	Shell      string    `json:"shell"`
	Executable *string   `json:"executable,omitempty"`
	Argv       *[]string `json:"argv,omitempty"`
	Script     *string   `json:"script,omitempty"`
}

func validExecutableName(name string) bool {
	if name == "" || len(name) > 255 || name == "." || name == ".." {
		return false
	}
	for _, c := range name {
		if !(c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || strings.ContainsRune("._-", c)) {
			return false
		}
	}
	return true
}
func (c CommandInput) valid() bool {
	if c.Shell == "direct" {
		if c.Executable == nil || !validExecutableName(*c.Executable) || c.Argv == nil || c.Script != nil || len(*c.Argv) > 256 {
			return false
		}
		size := len(*c.Executable)
		for _, a := range *c.Argv {
			if !utf8.ValidString(a) || strings.ContainsRune(a, 0) {
				return false
			}
			size += len(a) + 1
		}
		return size <= commandBytes
	}
	if c.Executable != nil || c.Argv != nil || c.Script == nil || len(*c.Script) > commandBytes || !utf8.ValidString(*c.Script) || strings.ContainsRune(*c.Script, 0) || strings.TrimSpace(*c.Script) == "" {
		return false
	}
	return c.Shell == "cmd" || c.Shell == "powershell" || c.Shell == "pwsh" || c.Shell == "sh"
}
func commandTimeout(seconds *uint32) uint32 {
	if seconds == nil || *seconds == 0 {
		return 30000
	}
	if *seconds > 120 {
		return 120000
	}
	return *seconds * 1000
}
func (c CommandInput) launchArgs(platform string) (string, []string, error) {
	if !c.valid() {
		return "", nil, errors.New("invalid command")
	}
	if platform != "linux" && platform != "windows" {
		return "", nil, errors.New("unsupported platform")
	}
	if c.Shell == "direct" {
		return *c.Executable, append([]string{}, (*c.Argv)...), nil
	}
	script := *c.Script
	switch c.Shell {
	case "sh":
		if platform == "linux" {
			return "sh", []string{"-c", script}, nil
		}
	case "cmd":
		if platform == "windows" {
			return "cmd.exe", []string{"/d", "/s", "/c", script}, nil
		}
	case "powershell", "pwsh":
		if platform == "windows" {
			units := utf16.Encode([]rune(script))
			body := make([]byte, len(units)*2)
			for i, u := range units {
				binary.LittleEndian.PutUint16(body[i*2:], u)
			}
			name := "powershell.exe"
			if c.Shell == "pwsh" {
				name = "pwsh.exe"
			}
			return name, []string{"-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", base64.StdEncoding.EncodeToString(body)}, nil
		}
	}
	return "", nil, errors.New("selected shell unsupported")
}

type ProviderBinding struct {
	ID            string `json:"id"`
	Revision      uint64 `json:"revision"`
	Qualification string `json:"qualification"`
}
type ExecutableIdentity struct {
	Path        string                   `json:"path"`
	Identity    fsutil.DirectoryIdentity `json:"identity"`
	ContentSHA3 string                   `json:"content_sha3"`
	ByteCount   int64                    `json:"byte_count"`
}
type CommandPrecondition struct {
	Platform          string                   `json:"platform"`
	Shell             string                   `json:"shell"`
	CwdIdentity       fsutil.DirectoryIdentity `json:"cwd_identity"`
	Executable        ExecutableIdentity       `json:"executable"`
	Argv              []string                 `json:"argv"`
	TimeoutMS         uint32                   `json:"timeout_ms"`
	OutputLimit       uint32                   `json:"output_limit"`
	EnvironmentPolicy string                   `json:"environment_policy"`
	Requirements      string                   `json:"requirements"`
	Provider          ProviderBinding          `json:"provider"`
	RequiresSandbox   bool                     `json:"requires_sandbox"`
}
type commandPins struct {
	cwd        *fsutil.NativeDirectory
	executable *os.File
}

func (p *commandPins) close() { p.cwd.Close(); _ = p.executable.Close() }
func executableSnapshot(file *os.File, path string) (ExecutableIdentity, error) {
	before, err := file.Stat()
	if err != nil || !before.Mode().IsRegular() || before.Size() < 4 || before.Size() > executableBytes {
		return ExecutableIdentity{}, errors.New("native executable required")
	}
	id, err := fsutil.NativeFileIdentity(file)
	if err != nil {
		return ExecutableIdentity{}, err
	}
	var magic [4]byte
	if _, err := file.ReadAt(magic[:], 0); err != nil {
		return ExecutableIdentity{}, err
	}
	if runtime.GOOS == "linux" && magic != [4]byte{0x7f, 'E', 'L', 'F'} || runtime.GOOS == "windows" && (magic[0] != 'M' || magic[1] != 'Z') {
		return ExecutableIdentity{}, errors.New("implicit interpreter denied")
	}
	hash := sha3.New256()
	n, err := io.Copy(hash, io.NewSectionReader(file, 0, executableBytes+1))
	if err != nil || n != before.Size() {
		return ExecutableIdentity{}, errors.New("executable changed")
	}
	after, err := file.Stat()
	if err != nil || after.Size() != before.Size() || !after.ModTime().Equal(before.ModTime()) {
		return ExecutableIdentity{}, errors.New("executable changed")
	}
	return ExecutableIdentity{Path: path, Identity: id, ContentSHA3: hex.EncodeToString(hash.Sum(nil)), ByteCount: n}, nil
}
func prepareExecutable(c CommandInput) (*os.File, ExecutableIdentity, []string, error) {
	name, args, err := c.launchArgs(runtime.GOOS)
	if err != nil {
		return nil, ExecutableIdentity{}, nil, err
	}
	path, err := exec.LookPath(name)
	if err != nil || !filepath.IsAbs(path) {
		return nil, ExecutableIdentity{}, nil, errors.New("selected executable unavailable")
	}
	path, err = filepath.EvalSymlinks(path)
	if err != nil {
		return nil, ExecutableIdentity{}, nil, errors.New("selected executable unavailable")
	}
	if runtime.GOOS == "windows" && !strings.EqualFold(filepath.Ext(path), ".exe") {
		return nil, ExecutableIdentity{}, nil, errors.New("implicit shell denied")
	}
	f, err := fsutil.OpenNativeExecutable(path)
	if err != nil {
		return nil, ExecutableIdentity{}, nil, errors.New("selected executable unavailable")
	}
	snapshot, err := executableSnapshot(f, path)
	if err != nil {
		_ = f.Close()
		return nil, ExecutableIdentity{}, nil, err
	}
	return f, snapshot, args, nil
}
