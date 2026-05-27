package harness

import (
	"io"
	"log"
	"net/http"
	"strings"
)

// WAFTransport wraps an existing http.RoundTripper to enforce the GitHub API read-only boundary
// and the explicit repository whitelist.
type WAFTransport struct {
	Base         http.RoundTripper
	AllowedRepos []string
}

func (t *WAFTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	// Target Identification
	isGitHubAPI := req.URL.Host == "api.github.com"
	isGitHubWeb := req.URL.Host == "github.com"

	if isGitHubAPI || isGitHubWeb {
		// Enforce Read-Only Boundary
		switch req.Method {
		case http.MethodGet, http.MethodHead, http.MethodOptions:
			// Safe, proceed to repo check
		default:
			// Future override check can be added here using req.Context()
			
			// Hard Block
			log.Printf("[WAF BLOCKED] Agent attempted destructive action: %s %s", req.Method, req.URL.String())

			// Return a mock 403 Forbidden response without hitting the network
			return &http.Response{
				StatusCode: http.StatusForbidden,
				Status:     "403 Forbidden by Lattice WAF",
				Body:       io.NopCloser(strings.NewReader(`{"error": "Lattice WAF: Destructive GitHub actions are disabled in Phase 1."}`)),
				Request:    req,
			}, nil
		}

		// Enforce Repository Whitelist
		var repoTarget string
		parts := strings.Split(strings.Trim(req.URL.Path, "/"), "/")
		
		if isGitHubAPI && len(parts) >= 3 && parts[0] == "repos" {
			repoTarget = parts[1] + "/" + parts[2]
		} else if isGitHubWeb && len(parts) >= 2 {
			repoTarget = parts[0] + "/" + parts[1]
		}

		if repoTarget != "" {
			allowed := false
			for _, allowedRepo := range t.AllowedRepos {
				if strings.EqualFold(allowedRepo, repoTarget) {
					allowed = true
					break
				}
			}

			if !allowed {
				log.Printf("[WAF BLOCKED] Agent attempted to access unauthorized repository: %s", repoTarget)
				return &http.Response{
					StatusCode: http.StatusForbidden,
					Status:     "403 Forbidden by Lattice WAF",
					Body:       io.NopCloser(strings.NewReader(`{"error": "Lattice WAF: Repository not in the explicitly allowed workspace list."}`)),
					Request:    req,
				}, nil
			}
		}
	}

	// Pass safe requests to the actual network transport
	base := t.Base
	if base == nil {
		base = http.DefaultTransport
	}
	return base.RoundTrip(req)
}
