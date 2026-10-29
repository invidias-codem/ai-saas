package nativeprotocol

import (
	"encoding/json"
	"os"
	"testing"
)

func TestProposalCanonicalFixturesMatchRustAndIndependentDigests(t *testing.T) {
	raw, err := os.ReadFile("../../../testdata/native-proposal-digests.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixtures []struct {
		Material ProposalMaterial `json:"material"`
		Digest   string           `json:"digest"`
	}
	if err := Decode(raw, &fixtures); err != nil {
		t.Fatal(err)
	}
	for _, fixture := range fixtures {
		actual, err := ProposalDigest(fixture.Material)
		if err != nil || actual != fixture.Digest {
			t.Fatalf("canonical digest mismatch: %s %v", actual, err)
		}
		changed := fixture.Material
		changed.Authority.GrantRevision++
		next, err := ProposalDigest(changed)
		if err != nil || next == actual {
			t.Fatal("digest did not bind the grant revision")
		}
		encoded, _ := json.Marshal(fixture.Material)
		var fields map[string]any
		_ = json.Unmarshal(encoded, &fields)
		fields["approved"] = true
		encoded, _ = json.Marshal(fields)
		var target ProposalMaterial
		if Decode(encoded, &target) == nil {
			t.Fatal("caller approval flag accepted")
		}
	}
}

func TestPreparedV2FixturesBindTrustedBaseAndParent(t *testing.T) {
	raw, err := os.ReadFile("../../../testdata/native-prepared-digests.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixtures []struct {
		Material ProposalMaterial `json:"material"`
		Digest   string           `json:"digest"`
	}
	if err := Decode(raw, &fixtures); err != nil {
		t.Fatal(err)
	}
	for _, f := range fixtures {
		actual, err := ProposalDigest(f.Material)
		if err != nil || actual != f.Digest {
			t.Fatalf("v2 mismatch %v", err)
		}
		changed := cloneMaterial(f.Material)
		changed.Precondition.ParentIdentity.File = "0000000000000001"
		next, err := ProposalDigest(changed)
		if err != nil || next == actual {
			t.Fatal("parent not bound")
		}
		if f.Material.Precondition.Base != nil {
			changed = cloneMaterial(f.Material)
			changed.Precondition.Base.Content += "edited"
			if _, err := ProposalDigest(changed); err == nil {
				t.Fatal("base content/hash mismatch accepted")
			}
		}
	}
}
