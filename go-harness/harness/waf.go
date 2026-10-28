package harness

import (
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"

	"github.com/invidias-codem/ai-saas/go-harness/internal/netguard"
)

type WAFTransport struct {
	Base         http.RoundTripper
	AllowedRepos []string
}

var repoPart = regexp.MustCompile(`^[A-Za-z0-9_.-]{1,100}$`)

func (t *WAFTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	denied := func() (*http.Response, error) {
		return &http.Response{StatusCode: http.StatusForbidden, Status: "403 Forbidden by Lattice WAF", Body: io.NopCloser(strings.NewReader(`{"error":"Lattice WAF: request outside approved GitHub read scope"}`)), Header: make(http.Header), Request: req}, nil
	}
	if netguard.ValidateURL(req.URL, "api.github.com", "github.com") != nil {
		return denied()
	}
	if req.Method != http.MethodGet && req.Method != http.MethodHead && req.Method != http.MethodOptions {
		return denied()
	}
	// Reject escaped separators and dot segments before interpreting repo scope.
	parts := strings.Split(strings.Trim(req.URL.EscapedPath(), "/"), "/")
	for i, part := range parts {
		decoded, err := url.PathUnescape(part)
		if err != nil || decoded == "." || decoded == ".." || strings.ContainsAny(decoded, "/\\%\x00\r\n") {
			return denied()
		}
		parts[i] = decoded
	}
	var owner, repo string
	if strings.EqualFold(req.URL.Hostname(), "api.github.com") {
		if req.URL.Path == "/user" || req.URL.Path == "/user/repos" {
			return t.forward(req)
		}
		if len(parts) < 3 || parts[0] != "repos" {
			return denied()
		}
		owner, repo = parts[1], parts[2]
	} else {
		if len(parts) < 2 {
			return denied()
		}
		owner, repo = parts[0], parts[1]
	}
	if !repoPart.MatchString(owner) || !repoPart.MatchString(repo) {
		return denied()
	}
	for _, allowed := range t.AllowedRepos {
		if strings.EqualFold(allowed, owner+"/"+repo) {
			return t.forward(req)
		}
	}
	return denied()
}

func (t *WAFTransport) forward(req *http.Request) (*http.Response, error) {
	base := t.Base
	if base == nil {
		base = githubTransport
	}
	return base.RoundTrip(req)
}

var githubTransport = netguard.NewTransport("api.github.com", "github.com")
