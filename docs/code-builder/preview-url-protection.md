# Preview URL protection — 8G security plan

**Phase 8G.0:** Fail-closed sharing and honest VM revocation status.
**Phase 8G.1:** Independently enforced ingress gateway (NOT implemented).
**Release:** No production sandbox or public-sharing flag changes.

## Threat model

The current `Sandbox.create({ ports: [3000] })` + `sandbox.domain(3000)`
yields a **public HTTPS origin**. An authenticated owner landing page does
not restrict that port. Vercel Sandbox `networkPolicy` filters outbound
requests only. Vercel Deployment Protection is for deployment URLs and must
not be assumed to protect Sandbox port domains.

The 8G.0 patch leaves the owner preview flow **unlisted, not private**.
Removing raw links from a POST response is not authorization; the iframe
and browser can still reveal the origin.

## Completed groundwork

1. Shared-preview creation and resolution are hard-denied independently of
   `ENABLE_PREVIEW_SHARING`. No accidental flag flip can expose the link.
2. Preview creation API returns only previewId and status.
3. `destroySandbox` propagates provider stop errors; expired status is not
   written after a failed stop. Expiry requests actually invoke stop.
4. The owner iframe sets no-referrer and disallows popup creation.
5. Tests cover fail-closed sharing and failed provider-stop behavior.

## Required protected-ingress design (8G.1)

An independently authenticated viewer gateway must run on an **isolated
origin** (not `gen1e.xyz` and not a sandbox app endpoint). The generated app
must have *no independently exposed public port* (`ports: []`) unless a
provider-level incoming ACL is verifiably enforced.

Lattice authorizes the viewer and issues a short-lived, hashed, revocable
grant. The **gateway** verifies the grant for every HTML, JS/CSS asset, API
request, and WebSocket upgrade, and forwards to the internal app over a
verified private transport. Do **not** inject platform secrets, auth cookies,
or signing credentials into the untrusted app process. Do not proxy untrusted
HTML/JS onto the `gen1e.xyz` origin.

Before implementation, prove Vercel Sandbox supports a private gateway-to-app
transport. If not, leverage the VDI desktop/browser stream with no public
app port, or a separately protected deployment on a dedicated origin.
Do not use a gateway that simply fronts a still-public sandbox URL.

## Acceptance

- Anonymous direct raw URL is rejected, including top-level navigation,
  asset URLs, alternate origins, WebSockets and after snapshot/resume.
- Different workspace/user denied. Test short session expiration and
  explicit revoke, plus failures of database/identity providers.
- No Lattice Clerk/Supabase/Vercel credentials in app/browser.
- iOS Safari and desktop browser asset loading, cookie restrictions checked.
- Stop failure never reports successful revoke; unexpected VM cleanup is
  retried and reconciled with a provider inventory.
- Public sharing remains off until issue #479 verification closes.

Sources: https://vercel.com/docs/sandbox and
https://vercel.com/docs/deployment-protection
