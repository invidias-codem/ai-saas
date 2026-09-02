import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/checkout/kofi/redirect?token=...&page=...
 *
 * Renders a tiny interstitial that:
 *   1. Copies the JWT to the clipboard (requires user gesture).
 *   2. After "Copy" click, redirects the buyer to the Ko-fi tier page where
 *      they paste the JWT into the "Add a message" field before paying.
 *   3. On the server side, /api/webhooks/kofi extracts the JWT from
 *      payload.message and uses the embedded clerk_user_id for accounting.
 *
 * This extra step exists because Ko-fi does not expose a URL param for
 * prefilling the buyer's message field. Without it, anyone landing on Ko-fi
 * without the JWT would leave `payload.message` as free-text — the webhook
 * would then fall back to email matching, which is brittle.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const page = req.nextUrl.searchParams.get("page");

  if (!token || !page) {
    return NextResponse.json({ error: "Missing token or page" }, { status: 400 });
  }

  const kofiUrl = `https://ko-fi.com/${encodeURIComponent(page)}`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="robots" content="noindex,nofollow"/>
<title>Redirecting to Ko-fi…</title>
<style>
  body{margin:0;font-family:system-ui,-apple-system,sans-serif;background:#0a0a0a;color:#e5e5e5;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}
  .card{max-width:520px;background:#111;border:1px solid #262626;border-radius:16px;padding:32px;text-align:center}
  h1{font-size:20px;margin:0 0 8px;font-weight:600;letter-spacing:-0.01em}
  p{font-size:14px;color:#a3a3a3;line-height:1.55;margin:0 0 20px}
  .step{display:flex;gap:10px;text-align:left;background:#0d0d0d;border:1px solid #1f1f1f;border-radius:10px;padding:12px;margin:0 0 12px;font-size:13px}
  .step-num{flex-shrink:0;width:22px;height:22px;border-radius:50%;background:#7c3aed;color:#fff;font-weight:600;font-size:12px;display:flex;align-items:center;justify-content:center}
  button{appearance:none;border:0;border-radius:10px;background:linear-gradient(135deg,#a855f7,#ec4899);color:#fff;font-weight:600;font-size:14px;padding:14px 28px;cursor:pointer;transition:transform 120ms ease,box-shadow 120ms ease;min-height:48px;width:100%}
  button:hover{transform:translateY(-1px)}
  button:active{transform:scale(0.98)}
  button:disabled{opacity:0.6;cursor:wait}
  .small{font-size:12px;color:#737373;margin-top:16px}
  .token-preview{font-family:ui-monospace,Menlo,monospace;font-size:11px;color:#c084fc;background:#0d0d0d;border:1px solid #1f1f1f;border-radius:8px;padding:10px;word-break:break-all;margin:14px 0;max-height:84px;overflow:auto;text-align:left}
</style>
</head>
<body>
  <div class="card">
    <h1>Complete your subscription</h1>
    <p>We'll copy a one-time token to your clipboard. Paste it into the <strong>"Add a message"</strong> field on Ko-fi before paying — this associates the payment with your Lattice account.</p>

    <div class="step"><div class="step-num">1</div><div>Click <strong>Copy &amp; continue</strong> below.</div></div>
    <div class="step"><div class="step-num">2</div><div>On the Ko-fi page, paste the token into the message field.</div></div>
    <div class="step"><div class="step-num">3</div><div>Complete payment via PayPal or card.</div></div>

    <div class="token-preview" id="preview">${token.slice(0, 32)}…${token.slice(-16)}</div>

    <button id="go" type="button">Copy &amp; continue to Ko-fi</button>
    <p class="small">The token expires in 15 minutes. If it expires, return to Lattice and start checkout again.</p>
  </div>

<script>
  const token = ${JSON.stringify(token)};
  const target = ${JSON.stringify(kofiUrl)};
  const btn = document.getElementById('go');
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      await navigator.clipboard.writeText(token);
      btn.textContent = '✓ Copied — opening Ko-fi…';
    } catch (e) {
      // Clipboard API blocked (rare in modern browsers for an activated click).
      // Fall back to showing the token in a selectable element.
      btn.textContent = 'Could not auto-copy — select the token above and copy manually, then continue';
      const el = document.getElementById('preview');
      el.style.userSelect = 'all';
      el.style.cursor = 'text';
    }
    setTimeout(() => { window.location.href = target; }, 700);
  });
</script>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
