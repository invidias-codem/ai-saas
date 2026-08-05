# gen1e.xyz — Cloudflare Security Hardening

**Domain:** gen1e.xyz  
**CDN:** Cloudflare → Vercel  
**Date:** 2026-06-20  
**Sprint:** Enterprise Trust + Procurement Hardening

---

## 1. DNS Records — SPF + DMARC (HIGH Priority)

Add these records in your Cloudflare DNS dashboard:

### SPF Record (prevents email spoofing)

| Type | Name | Content | Proxy Status |
|------|------|---------|-------------|
| TXT | `@` | `v=spf1 include:_spf.google.com ~all` | DNS only |
| TXT | `_dmarc` | `v=DMARC1; p=quarantine; rua=mailto:admin@gen1e.xyz; adkim=s; aspf=s` | DNS only |

> **Note:** Replace `_spf.google.com` with your email provider if you don't use Google Workspace.
> 
> Other common SPF includes:
> - Google Workspace: `include:_spf.google.com`
> - Microsoft 365: `include:spf.protection.outlook.com`
> - SendGrid: `include:sendgrid.net`
> - Mailgun: `include:mailgun.org`
> - Postmark: `include:postmarkapp.com`
> - Fastmail: `include:spf.messagingengine.com`
> 
> Use `~all` (softfail) initially. After confirming legitimate senders, tighten to `-all` (hardfail).

### Verification

After adding records:
```bash
dig -t TXT gen1e.xyz        # Should show v=spf1...
dig -t TXT _dmarc.gen1e.xyz  # Should show v=DMARC1...
```

Use https://dmarcian.com/dmarc-inspector/ to validate.

---

## 2. Transform Rules — Strip Information-Leaking Headers (LOW)

**Dashboard path:** Rules → Transform Rules → Modify Response Header

### Rule 1: Strip Vercel Origin Headers

| Field | Value |
|-------|-------|
| **Name** | `Strip Vercel Origin Info` |
| **When incoming requests match** | `(http.request.uri.path contains "/") ` |
| **Then** | Remove response headers |

**Headers to remove:**

| Header | Reason |
|--------|--------|
| `x-vercel-id` | Leaks edge node region + request ID |
| `x-vercel-cache` | Confirms Vercel hosting + cache behavior |
| `x-matched-path` | Leaks internal Next.js routing path |

### Rule 2: Strip Clerk Auth Status Headers

| Field | Value |
|-------|-------|
| **Name** | `Strip Clerk Auth Leakage` |
| **When incoming requests match** | `(http.request.uri.path contains "/") ` |
| **Then** | Remove response headers |

**Headers to remove:**

| Header | Reason |
|--------|--------|
| `x-clerk-auth-status` | Exposes authentication mechanism |
| `x-clerk-auth-reason` | Exposes session validation details |

### Rule 3: Add Strict Transport Security Override (Backup)

This is already set by Next.js headers, but add as a Cloudflare fallback:

**Dashboard path:** SSL/TLS → Edge Certificates → HSTS

| Setting | Value |
|---------|-------|
| Enabled | On |
| Include subdomains | On |
| Max Age | 63072000 (2 years) |
| Preload | On |
| No-Sniff | On |

---

## 3. Page Rules — Origin Protection

**Dashboard path:** Rules → Page Rules

> **⚠️ Important:** Your Next.js config now sets strict CORS headers. These page rules act as a second layer ensuring Cloudflare never overrides them.

### Rule 1: Prevent Wildcard CORS Override

| Field | Value |
|-------|-------|
| **URL** | `gen1e.xyz/*` |
| **Setting** | `Cache Level` → `Standard` |
| **Setting** | `Browser Cache TTL` → `1 month` |

### Rule 2: API Routes — No caching

| Field | Value |
|-------|-------|
| **URL** | `gen1e.xyz/api/*` |
| **Setting** | `Cache Level` → `Bypass` |
| **Setting** | `Browser Cache TTL` → `Respect Existing Headers` |

### Rule 3: Partner API — Strict headers

| Field | Value |
|-------|-------|
| **URL** | `gen1e.xyz/api/v1/*` |
| **Setting** | `Cache Level` → `Bypass` |
| **Setting** | `Security Level` → `Medium` |

---

## 4. Cloudflare WAF Rules (if on Pro plan or above)

### Custom Rule: Block wp-config probes

| Field | Value |
|-------|-------|
| **Rule name** | `Block WordPress Config Probes` |
| **Expression** | `(http.request.uri.path contains "wp-config") or (http.request.uri.path contains "wp-admin") or (http.request.uri.path contains "xmlrpc.php")` |
| **Action** | `Block` |
| **Priority** | High |

### Custom Rule: Rate-limit API endpoints

| Field | Value |
|-------|-------|
| **Rule name** | `API Rate Limit` |
| **Expression** | `(http.request.uri.path starts_with "/api/") and not (http.request.uri.path starts_with "/api/v1/docs")` |
| **Action** | `Managed Challenge` when rate exceeded |
| **Rate** | 100 requests per 10 seconds per IP |

---

## 5. SSL/TLS Settings

| Setting | Value |
|---------|-------|
| SSL/TLS encryption mode | `Full (Strict)` |
| Minimum TLS version | `1.2` |
| Always Use HTTPS | `On` |
| Automatic HTTPS Rewrites | `On` |
| Authenticated Origin Pulls | `Off` (Vercel doesn't support mTLS) |

---

## 6. Verification Checklist

After applying all changes, verify:

```bash
# 1. SPF exists
dig -t TXT gen1e.xyz | grep v=spf1

# 2. DMARC exists
dig -t TXT _dmarc.gen1e.xyz | grep v=DMARC1

# 3. No wildcard CORS
curl -sI https://gen1e.xyz | grep -i access-control-allow-origin
# Expected: gen1e.xyz (NOT "*")

# 4. No x-vercel-id
curl -sI https://gen1e.xyz | grep -i x-vercel-id
# Expected: (empty — header removed)

# 5. No x-clerk-auth headers
curl -sI https://gen1e.xyz | grep -i x-clerk
# Expected: (empty — headers removed)

# 6. wp-config returns 403, not content
curl -sI https://gen1e.xyz/wp-config.php.bak
# Expected: 403 or 404

# 7. HSTS present
curl -sI https://gen1e.xyz | grep strict-transport
# Expected: max-age=63072000; includeSubDomains; preload
```

---

## Summary

| Priority | Item | Status |
|----------|------|--------|
| **HIGH** | SPF + DMARC DNS records | ⬜ Add in Cloudflare DNS |
| **MEDIUM** | Wildcard CORS removal | ✅ Fixed in `next.config.mjs` |
| **LOW** | Strip x-vercel-* headers | ⬜ Add Transform Rules |
| **LOW** | Strip x-clerk-* headers | ⬜ Add Transform Rules |
| **BONUS** | WAF rules (wp-config, rate limit) | ⬜ Add if Pro plan |
| **BONUS** | SSL/TLS Full Strict | ⬜ Verify in SSL settings |
---

## 7. SSE /cli/stream Proxy and Timeout Behavior

The new terminal-native architecture depends on `/api/cli/stream` behaving like raw SSE. Cloudflare, by default, applies 100-second idle timeouts and may buffer or coalesce small chunks. Both behaviors break long agent tool sequences.

### Required settings

- `/api/cli/stream` **must** bypass unnecessary caching and buffering at the edge.
- Do **not** use `Cache Level: Standard` for this route.
- Use `Cache Level: Bypass` so Cloudflare does not store or coalesce chunked frames.
- Ensure chunked transfer support remains enabled so `Transfer-Encoding: chunked` is honored end-to-end.

### Cloudflare timeout reality

- Cloudflare can terminate an idle SSE connection after about `100` seconds.
- If the assistant is silent or only emitting keepalive whitespace, client reads will stop.
- Document recovery behavior in CLI clients and backend tool loops, rather than trying to avoid silence entirely.

### Client reconnection behavior

- On timeout or dropped connection, terminate the stream gracefully instead of blocking indefinitely.
- Surface "stream timeout" to the user rather than leaving the shell loop waiting forever.
- Optional: client-side resume/retry with idempotent request reconstruction if workflow requires it.

### Verification

```bash
# 1. Confirm chunked transfer support
curl -N -I -X POST http://localhost:3000/api/cli/stream \
  -H "Content-Type: application/json" \
  -H "x-lattice-user-id: local-dev" \
  -d '{"messages":[{"role":"user","text":"ping"}],"options":{}}' \
  | grep -i "transfer-encoding"

# Expected: transfer-encoding: chunked

# 2. Confirm SSE line framing is preserved through Cloudflare
curl -N -s http://localhost:3000/api/cli/stream \
  -X POST \
  -H "Content-Type: application/json" \
  -H "x-lattice-user-id: local-dev" \
  -d '{"messages":[{"role":"user","text":"ping"}],"options":{}}' \
  | sed -n '1,5p'

# Expected: event:/data: lines with no buffering/rewrap
```

### Operational note

If the deployment introduces additional proxy or CDN hops beyond Cloudflare, each hop must preserve:
- chunked streaming semantics
- keepalive behavior
- SSE event ordering

Any future rewrite or caching layer must preserve these properties for `/api/cli/stream` and `/api/memory/cli`.


