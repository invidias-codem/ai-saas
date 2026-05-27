package harness

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"
)

// MockRoundTripper mocks a successful network request
type MockRoundTripper struct{}

func (m *MockRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	return &http.Response{
		StatusCode: http.StatusOK,
		Body:       io.NopCloser(strings.NewReader("OK")),
	}, nil
}

func TestWAFTransport_AllowedRequests(t *testing.T) {
	waf := &WAFTransport{Base: &MockRoundTripper{}, AllowedRepos: []string{"invidias-codem/ai-saas"}}
	client := &http.Client{Transport: waf}

	tests := []struct {
		method string
		url    string
	}{
		{http.MethodGet, "https://api.github.com/user"}, // User root, no repo
		{http.MethodGet, "https://api.github.com/repos/invidias-codem/ai-saas/issues"},
		{http.MethodGet, "https://github.com/invidias-codem/ai-saas/tree/main"},
		{http.MethodPost, "https://example.com/api"}, // Non-GitHub domain allowed
	}

	for _, tc := range tests {
		req, _ := http.NewRequestWithContext(context.Background(), tc.method, tc.url, nil)
		resp, err := client.Do(req)
		if err != nil {
			t.Fatalf("Unexpected error for %s %s: %v", tc.method, tc.url, err)
		}
		if resp.StatusCode != http.StatusOK {
			t.Errorf("Expected status 200 OK for %s %s, got %d", tc.method, tc.url, resp.StatusCode)
		}
	}
}

func TestWAFTransport_BlockedRequests(t *testing.T) {
	waf := &WAFTransport{Base: &MockRoundTripper{}, AllowedRepos: []string{"invidias-codem/ai-saas"}}
	client := &http.Client{Transport: waf}

	tests := []struct {
		method string
		url    string
	}{
		{http.MethodPost, "https://api.github.com/repos/invidias-codem/ai-saas/pulls"}, // Allowed repo, but destructive method
		{http.MethodPut, "https://api.github.com/repos/invidias-codem/ai-saas/contents/file.txt"}, // Allowed repo, but destructive method
		{http.MethodGet, "https://api.github.com/repos/unauthorized/repo"}, // Safe method, but unauthorized repo
		{http.MethodGet, "https://github.com/unauthorized/repo/tree/main"}, // Safe method, but unauthorized repo
	}

	for _, tc := range tests {
		req, _ := http.NewRequestWithContext(context.Background(), tc.method, tc.url, nil)
		resp, err := client.Do(req)
		if err != nil {
			t.Fatalf("Unexpected error for %s %s: %v", tc.method, tc.url, err)
		}
		if resp.StatusCode != http.StatusForbidden {
			t.Errorf("Expected status 403 Forbidden for %s %s, got %d", tc.method, tc.url, resp.StatusCode)
		}
		
		bodyBytes, _ := io.ReadAll(resp.Body)
		bodyStr := string(bodyBytes)
		if !strings.Contains(bodyStr, "Lattice WAF") {
			t.Errorf("Expected WAF error message in body, got: %s", bodyStr)
		}
	}
}
