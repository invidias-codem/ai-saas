// Package netguard owns the native harness's outbound HTTP boundary. Product
// cloud calls use one fixed HTTPS origin; request payloads cannot enroll hosts.
package netguard

import (
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"regexp"
	"strings"
	"time"
)

const AppOrigin = "https://gen1e.xyz"
const MaxResponseBytes = 2 * 1024 * 1024

var workspaceID = regexp.MustCompile(`^[A-Za-z0-9_-]{1,128}$`)
var CloudClient = NewClient("gen1e.xyz")

func APIURL(base, workspace, action string) (string, error) {
	if base != AppOrigin || !workspaceID.MatchString(workspace) || (action != "search" && action != "ingest") {
		return "", errors.New("cloud endpoint is not approved")
	}
	return AppOrigin + "/api/workspaces/" + workspace + "/" + action, nil
}

func ValidateURL(u *url.URL, hosts ...string) error {
	if u == nil || u.Scheme != "https" || u.User != nil || u.Fragment != "" || (u.Port() != "" && u.Port() != "443") {
		return errors.New("only approved HTTPS destinations are permitted")
	}
	for _, host := range hosts {
		if strings.EqualFold(u.Hostname(), host) {
			return nil
		}
	}
	return errors.New("network destination is not approved")
}

func RejectRedirect(_ *http.Request, _ []*http.Request) error {
	return errors.New("native cloud redirects are disabled")
}

type Transport struct {
	hosts []string
	base  *http.Transport
}

func NewClient(hosts ...string) *http.Client {
	return &http.Client{Transport: NewTransport(hosts...), Timeout: 15 * time.Second, CheckRedirect: RejectRedirect}
}

func NewTransport(hosts ...string) *Transport {
	hosts = append([]string(nil), hosts...)
	dialer := &net.Dialer{Timeout: 5 * time.Second, KeepAlive: 30 * time.Second}
	base := &http.Transport{
		Proxy: nil, ForceAttemptHTTP2: true, TLSHandshakeTimeout: 5 * time.Second,
		ResponseHeaderTimeout: 10 * time.Second, IdleConnTimeout: 30 * time.Second,
		MaxIdleConns: 8, MaxConnsPerHost: 4,
	}
	base.DialContext = func(ctx context.Context, network, address string) (net.Conn, error) {
		return dialPublic(ctx, network, address, hosts, net.DefaultResolver.LookupIPAddr, dialer.DialContext)
	}
	return &Transport{hosts: hosts, base: base}
}

func (t *Transport) RoundTrip(req *http.Request) (*http.Response, error) {
	if err := ValidateURL(req.URL, t.hosts...); err != nil {
		return nil, err
	}
	return t.base.RoundTrip(req)
}

func (t *Transport) CloseIdleConnections() { t.base.CloseIdleConnections() }

// Resolve once and dial only the validated addresses, so a second DNS lookup
// cannot change a public destination into a loopback/private endpoint.
func dialPublic(ctx context.Context, network, address string, hosts []string, lookup func(context.Context, string) ([]net.IPAddr, error), dial func(context.Context, string, string) (net.Conn, error)) (net.Conn, error) {
	host, port, err := net.SplitHostPort(address)
	if err != nil || port != "443" {
		return nil, errors.New("network destination is not approved")
	}
	if err := ValidateURL(&url.URL{Scheme: "https", Host: host}, hosts...); err != nil {
		return nil, err
	}
	addresses, err := lookup(ctx, host)
	if err != nil || len(addresses) == 0 {
		return nil, errors.New("approved host DNS resolution failed")
	}
	for _, address := range addresses {
		if !publicIP(address.IP) {
			return nil, errors.New("approved host resolved to a prohibited address")
		}
	}
	for _, address := range addresses {
		conn, err := dial(ctx, network, net.JoinHostPort(address.IP.String(), port))
		if err == nil {
			return conn, nil
		}
	}
	return nil, errors.New("approved host connection failed")
}

var prohibited = []netip.Prefix{
	netip.MustParsePrefix("0.0.0.0/8"), netip.MustParsePrefix("100.64.0.0/10"),
	netip.MustParsePrefix("192.0.0.0/24"), netip.MustParsePrefix("192.0.2.0/24"),
	netip.MustParsePrefix("198.18.0.0/15"), netip.MustParsePrefix("198.51.100.0/24"),
	netip.MustParsePrefix("203.0.113.0/24"), netip.MustParsePrefix("240.0.0.0/4"),
	netip.MustParsePrefix("2001::/23"), netip.MustParsePrefix("2001:db8::/32"), netip.MustParsePrefix("2002::/16"),
}

func publicIP(ip net.IP) bool {
	addr, ok := netip.AddrFromSlice(ip)
	if !ok {
		return false
	}
	addr = addr.Unmap()
	if !addr.IsGlobalUnicast() || addr.IsPrivate() || addr.IsLoopback() || addr.IsLinkLocalUnicast() {
		return false
	}
	if addr.Is6() && !netip.MustParsePrefix("2000::/3").Contains(addr) {
		return false
	}
	for _, prefix := range prohibited {
		if prefix.Contains(addr) {
			return false
		}
	}
	return true
}

func ReadBody(body io.Reader) ([]byte, error) {
	data, err := io.ReadAll(io.LimitReader(body, MaxResponseBytes+1))
	if err != nil {
		return nil, err
	}
	if len(data) > MaxResponseBytes {
		return nil, errors.New("upstream response exceeds native limit")
	}
	return data, nil
}
