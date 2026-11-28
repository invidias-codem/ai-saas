package telemetry

import (
	"github.com/invidias-codem/ai-saas/go-harness/internal/netguard"
	"net/http"
	"testing"
	"time"
)

type closeTransport func(*http.Request) (*http.Response, error)

func (f closeTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestCloseCancelsAndJoinsAnImmediateFlush(t *testing.T) {
	previous := netguard.CloudClient
	t.Cleanup(func() { netguard.CloudClient = previous })
	entered, finished := make(chan struct{}), make(chan struct{})
	netguard.CloudClient = &http.Client{Transport: closeTransport(func(r *http.Request) (*http.Response, error) {
		close(entered)
		<-r.Context().Done()
		close(finished)
		return nil, r.Context().Err()
	})}
	manager := NewManager()
	defer manager.Close()
	if err := manager.StartFlusher(netguard.AppOrigin, "fixture-upstream-token"); err != nil {
		t.Fatal(err)
	}
	manager.FlushImmediate(TelemetryEvent{EventType: "fixture"})
	select {
	case <-entered:
	case <-time.After(time.Second):
		t.Fatal("flush did not start")
	}
	done := make(chan struct{})
	go func() { manager.Close(); close(done) }()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("close did not finish")
	}
	select {
	case <-finished:
	default:
		t.Fatal("close returned before network worker ended")
	}
	if err := manager.StartFlusher(netguard.AppOrigin, "fixture-upstream-token"); err == nil {
		t.Fatal("closed manager restarted work")
	}
}
