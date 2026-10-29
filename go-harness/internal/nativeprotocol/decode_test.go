package nativeprotocol

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestDecodeRejectsAmbiguousOrIncompleteAuthority(t *testing.T) {
	valid := `{"protocol_version":1,"authority":{"principal_id":"local-user-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","workspace_id":"local-workspace-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","generation":"cccccccccccccccccccccccccccccccc","policy_revision":1,"grant_revision":0}}`
	var binding Binding
	if err := Decode([]byte(valid), &binding); err != nil {
		t.Fatal("valid binding rejected", err)
	}
	for _, raw := range []string{
		strings.Replace(valid, `"grant_revision":0`, `"grant_revision":null`, 1),
		strings.Replace(valid, `,"grant_revision":0`, ``, 1),
		strings.Replace(valid, `"grant_revision":0`, `"grant_revision":0,"grant_revision":1`, 1),
		strings.Replace(valid, `"grant_revision":0`, `"Grant_Revision":0`, 1),
		strings.Replace(valid, `"grant_revision":0`, `"grant_revision":0,"role":"admin"`, 1),
		strings.Replace(valid, `"protocol_version":1`, `"protocol_version":"1"`, 1),
		valid + `{}`,
	} {
		if Decode([]byte(raw), &binding) == nil {
			t.Fatal("invalid native authority decoded")
		}
	}
}

func TestDecodeBoundsNestingAndRejectsDuplicateRawInputs(t *testing.T) {
	var value struct {
		Inputs json.RawMessage `json:"inputs"`
	}
	for _, raw := range []string{
		`{"inputs":{"command":"first","command":"second"}}`,
		`{"inputs":` + strings.Repeat("[", 70) + `0` + strings.Repeat("]", 70) + `}`,
	} {
		if Decode([]byte(raw), &value) == nil {
			t.Fatal("ambiguous or deeply nested native input decoded")
		}
	}
}
