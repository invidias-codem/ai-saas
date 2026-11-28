package executil

import (
	"encoding/base64"
	"encoding/binary"
	"reflect"
	"testing"
	"unicode/utf16"
)

func TestSplitCommand(t *testing.T) {
	for _, tc := range []struct {
		input string
		want  []string
	}{
		{`"C:\Program Files\Tool\tool.exe" "C:\My Project\file.txt"`, []string{`C:\Program Files\Tool\tool.exe`, `C:\My Project\file.txt`}},
		{`echo "hello world" '' && $HOME`, []string{"echo", "hello world", "", "&&", "$HOME"}},
		{`python -c 'print("hello world")'`, []string{"python", "-c", `print("hello world")`}},
	} {
		got, err := SplitCommand(tc.input)
		if err != nil || !reflect.DeepEqual(got, tc.want) {
			t.Errorf("%q: got %q, %v; want %q", tc.input, got, err, tc.want)
		}
	}
	for _, input := range []string{"", `echo "unfinished`, "echo\x00bad"} {
		if _, err := SplitCommand(input); err == nil {
			t.Errorf("accepted invalid input %q", input)
		}
	}
}

func TestCommandShellSelection(t *testing.T) {
	script := `Write-Output '会社 "project"'; Get-ChildItem | Select-Object Name`
	for _, shell := range []Shell{PowerShell, Pwsh} {
		args, err := commandArgs("windows", script, shell)
		if err != nil {
			t.Fatal(err)
		}
		b, err := base64.StdEncoding.DecodeString(args[len(args)-1])
		if err != nil {
			t.Fatal(err)
		}
		units := make([]uint16, len(b)/2)
		for i := range units {
			units[i] = binary.LittleEndian.Uint16(b[2*i:])
		}
		if string(utf16.Decode(units)) != script {
			t.Fatal("PowerShell transport changed the approved script")
		}
	}
	args, err := commandArgs("windows", `echo hello & echo world`, CMD)
	if err != nil || !reflect.DeepEqual(args, []string{"cmd.exe", "/d", "/s", "/c", `echo hello & echo world`}) {
		t.Fatalf("CMD plan: %q %v", args, err)
	}
	for _, tc := range []struct {
		platform string
		shell    Shell
	}{{"linux", CMD}, {"linux", PowerShell}, {"windows", SH}, {"windows", "auto-fallback"}} {
		if _, err := commandArgs(tc.platform, "echo test", tc.shell); err == nil {
			t.Fatalf("accepted unsupported shell %q on %s", tc.shell, tc.platform)
		}
	}
}
