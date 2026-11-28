package telemetry

import (
	"github.com/invidias-codem/ai-saas/go-harness/internal/netguard"
	"testing"
)

func TestTelemetryLocalOnlyAndEndpointAdmission(t *testing.T) {
	m := NewManager()
	defer m.Close()
	m.RecordEvent(TelemetryEvent{UserID: "fixture"})
	for _, origin := range []string{"http://localhost:3000", "https://attacker.test", "https://gen1e.xyz.attacker.test"} {
		if err := m.StartFlusher(origin, "dummy-upstream"); err == nil {
			t.Fatalf("accepted origin %s", origin)
		}
	}
	if err := m.StartFlusher(netguard.AppOrigin, ""); err == nil {
		t.Fatal("accepted missing upstream authentication")
	}
	if err := m.StartFlusher("", ""); err != nil {
		t.Fatal(err)
	}
	m.Flush()
	if len(m.GetBufferedEvents()) != 1 {
		t.Fatal("local-only telemetry was consumed by a cloud flush")
	}
}

func TestTelemetryReconfigurationRace(t *testing.T) {
	m := NewManager()
	defer m.Close()
	done := make(chan struct{})
	go func() {
		defer close(done)
		for i := 0; i < 100; i++ {
			m.RecordEvent(TelemetryEvent{UserID: "fixture"})
			m.Flush()
		}
	}()
	for i := 0; i < 100; i++ {
		if err := m.StartFlusher("", ""); err != nil {
			t.Fatal(err)
		}
	}
	<-done
}
