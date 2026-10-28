package netguard

import (
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"testing"
)

func TestNetworkDestinationPolicy(t *testing.T) {
	for _, raw := range []string{
		"http://gen1e.xyz/api", "https://gen1e.xyz.attacker.test/api", "https://127.0.0.1/api",
		"https://gen1e.xyz:444/api", "https://user:password@gen1e.xyz/api", "https://gen1e.xyz/api#fragment",
		"https://gen1e.xyz./api", "https://[::1]/api",
	} {
		u, _ := url.Parse(raw)
		if ValidateURL(u, "gen1e.xyz") == nil {
			t.Errorf("accepted unapproved destination %s", raw)
		}
	}
	for _, raw := range []string{AppOrigin + "/api", "https://gen1e.xyz:443/api"} {
		u, _ := url.Parse(raw)
		if err := ValidateURL(u, "gen1e.xyz"); err != nil {
			t.Errorf("approved HTTPS rejected: %v", err)
		}
	}
	for _, workspace := range []string{"../other", "project/other", "project?token=secret", "", "a%2fb"} {
		if _, err := APIURL(AppOrigin, workspace, "search"); err == nil {
			t.Errorf("accepted workspace %q", workspace)
		}
	}
	if _, err := APIURL("https://attacker.test", "project", "ingest"); err == nil {
		t.Fatal("request payload enrolled a cloud origin")
	}
	if got, err := APIURL(AppOrigin, "project-1", "search"); err != nil || got != AppOrigin+"/api/workspaces/project-1/search" {
		t.Fatalf("approved API route rejected: %q %v", got, err)
	}
}

func TestNetworkDNSRejectsNonPublicAndMixedAnswers(t *testing.T) {
	for _, raw := range []string{"127.0.0.1", "10.0.0.1", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "198.18.0.1", "224.0.0.1", "240.0.0.1", "::1", "fc00::1", "fe80::1", "::ffff:127.0.0.1", "64:ff9b::7f00:1", "2001:db8::1", "2002:7f00:1::"} {
		if publicIP(net.ParseIP(raw)) {
			t.Errorf("address classified public: %s", raw)
		}
	}
	for _, ips := range [][]net.IPAddr{
		{{IP: net.ParseIP("127.0.0.1")}},
		{{IP: net.ParseIP("93.184.216.34")}, {IP: net.ParseIP("10.0.0.1")}},
	} {
		called := false
		_, err := dialPublic(context.Background(), "tcp", "gen1e.xyz:443", []string{"gen1e.xyz"}, func(context.Context, string) ([]net.IPAddr, error) { return ips, nil }, func(context.Context, string, string) (net.Conn, error) {
			called = true
			return nil, errors.New("must not connect")
		})
		if err == nil || called {
			t.Fatal("prohibited DNS answer reached a connection")
		}
	}
}

func TestNetworkDNSDialsOnlyValidatedAddresses(t *testing.T) {
	lookups := 0
	var destination string
	_, err := dialPublic(context.Background(), "tcp", "gen1e.xyz:443", []string{"gen1e.xyz"}, func(context.Context, string) ([]net.IPAddr, error) {
		lookups++
		return []net.IPAddr{{IP: net.ParseIP("93.184.216.34")}}, nil
	}, func(_ context.Context, _ string, address string) (net.Conn, error) {
		destination = address
		return nil, errors.New("test connection stopped")
	})
	if err == nil || lookups != 1 || destination != "93.184.216.34:443" {
		t.Fatalf("DNS was not pinned: lookups=%d dial=%q error=%v", lookups, destination, err)
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestNetworkRedirectNeverReplaysCredentials(t *testing.T) {
	client := NewClient("gen1e.xyz")
	calls := 0
	client.Transport = roundTripFunc(func(r *http.Request) (*http.Response, error) {
		calls++
		return &http.Response{StatusCode: 307, Header: http.Header{"Location": []string{"https://127.0.0.1/private"}}, Body: io.NopCloser(strings.NewReader("")), Request: r}, nil
	})
	req, _ := http.NewRequest("POST", AppOrigin+"/api", strings.NewReader("private fixture"))
	req.Header.Set("Authorization", "Bearer dummy-upstream")
	response, err := client.Do(req)
	if response != nil {
		response.Body.Close()
	}
	if err == nil || calls != 1 {
		t.Fatalf("redirect replayed: calls=%d error=%v", calls, err)
	}
}

func TestNetworkResponseBound(t *testing.T) {
	if _, err := ReadBody(strings.NewReader(strings.Repeat("x", MaxResponseBytes+1))); err == nil {
		t.Fatal("oversized response accepted")
	}
}
