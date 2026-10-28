package harness

import (
	"context"
	"github.com/invidias-codem/ai-saas/go-harness/internal/netguard"
	"net/http"
	"testing"
	"time"
)

type lifecycleTransport func(*http.Request) (*http.Response, error)

func (f lifecycleTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestCloudJobsHonorDaemonCancellation(t *testing.T) {
	for _, mode := range []string{"embeddings", "repository batch"} {
		t.Run(mode, func(t *testing.T) {
			previous := netguard.CloudClient
			t.Cleanup(func() { netguard.CloudClient = previous })
			entered := make(chan struct{})
			netguard.CloudClient = &http.Client{Transport: lifecycleTransport(func(r *http.Request) (*http.Response, error) {
				close(entered)
				<-r.Context().Done()
				return nil, r.Context().Err()
			})}
			ctx, cancel := context.WithCancel(t.Context())
			defer cancel()
			done := make(chan error, 1)
			go func() {
				if mode == "embeddings" {
					_, err := FetchEmbeddings(ctx, []string{"fixture"}, "fixture-upstream-token")
					done <- err
					return
				}
				client := NewIngestClientContext(ctx, "workspace", "owner/repository", "fixture-upstream-token", netguard.AppOrigin)
				_ = client.AddChunk(FileChunk{FilePath: "fixture.txt", Content: "fixture"})
				done <- client.Flush()
			}()
			select {
			case <-entered:
			case <-time.After(time.Second):
				t.Fatal("request did not start")
			}
			cancel()
			select {
			case err := <-done:
				if err == nil {
					t.Fatal("cancelled job reported success")
				}
			case <-time.After(time.Second):
				t.Fatal("request ignored daemon cancellation")
			}
		})
	}
}
