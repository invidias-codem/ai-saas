package executil

import (
	"encoding/base64"
	"encoding/binary"
	"fmt"
	"strings"
	"unicode"
	"unicode/utf16"
)

type Shell string

const (
	Direct     Shell = "direct"
	CMD        Shell = "cmd"
	PowerShell Shell = "powershell"
	Pwsh       Shell = "pwsh"
	SH         Shell = "sh"
)

// SplitCommand preserves quoted arguments without evaluating variables,
// substitutions, redirects or operators. Backslashes in Windows paths survive.
func SplitCommand(command string) ([]string, error) {
	var args []string
	var arg strings.Builder
	var quote rune
	started := false
	runes := []rune(command)
	for i := 0; i < len(runes); i++ {
		c := runes[i]
		if c == 0 {
			return nil, fmt.Errorf("command contains NUL")
		}
		if c == '\\' && i+1 < len(runes) && quote != '\'' && (runes[i+1] == '"' || runes[i+1] == '\'') {
			i++
			arg.WriteRune(runes[i])
			started = true
			continue
		}
		if quote != 0 {
			if c == quote {
				quote = 0
			} else {
				arg.WriteRune(c)
			}
		} else if c == '\'' || c == '"' {
			quote = c
			started = true
		} else if unicode.IsSpace(c) {
			if started {
				args = append(args, arg.String())
				arg.Reset()
				started = false
			}
		} else {
			arg.WriteRune(c)
			started = true
		}
	}
	if quote != 0 {
		return nil, fmt.Errorf("unterminated quoted argument")
	}
	if started {
		args = append(args, arg.String())
	}
	if len(args) == 0 || args[0] == "" {
		return nil, fmt.Errorf("empty command")
	}
	return args, nil
}

func commandArgs(platform, command string, shell Shell) ([]string, error) {
	if len(command) > 65536 || strings.TrimSpace(command) == "" || strings.ContainsRune(command, 0) {
		return nil, fmt.Errorf("empty or invalid command")
	}
	if shell == "" || shell == Direct {
		return SplitCommand(command)
	}
	switch shell {
	case CMD:
		if platform == "windows" {
			return []string{"cmd.exe", "/d", "/s", "/c", command}, nil
		}
	case PowerShell, Pwsh:
		if platform == "windows" {
			name := "powershell.exe"
			if shell == Pwsh {
				name = "pwsh.exe"
			}
			// UTF-16 transport avoids interpreting script quotes in cmd.exe or
			// concatenating shell fragments. The original script is approved as data.
			units := utf16.Encode([]rune(command))
			bytes := make([]byte, len(units)*2)
			for i, u := range units {
				binary.LittleEndian.PutUint16(bytes[i*2:], u)
			}
			return []string{name, "-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", base64.StdEncoding.EncodeToString(bytes)}, nil
		}
	case SH:
		if platform != "windows" {
			return []string{"sh", "-c", command}, nil
		}
	default:
		return nil, fmt.Errorf("unknown shell %q", shell)
	}
	return nil, fmt.Errorf("shell %q is unsupported on %s", shell, platform)
}
