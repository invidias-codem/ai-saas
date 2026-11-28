# Product Hunt launch — acceptance QA runbook

This integrates release-verification tooling into main, NOT Product Hunt launch approval. The Mineral/Copper landing route is already in main through PR #487; the PR #488 branch was closed without merging. Public publishing remains gated by Issue #479.
Private publishing remains in testing and Issue #479 is a separate gate.

## Public marketing visual QA

Run from the repository with Node and Playwright installed:

    node --test scripts/launch/qa-policy.test.mjs
    pnpm exec playwright install chromium
    pnpm qa:launch --url https://gen1e.xyz/en/launch --out launch-qa-artifacts

Or use the exact Preview URL from Vercel for PR #488.

The runner checks 320/375/390/1440px in light and dark modes, page overflow,
Code Builder CTA, noindex status, structural accessibility sanity and the
interactive walkthrough. Eight PNGs and report.json are produced only when
the public landing page is accessible. These are NOT Code Builder output
captures and do not count as Safari, WCAG, sign-in or first-build acceptance.

For a protected Vercel Preview, do NOT disable Deployment Protection.
Use the existing short-lived Vercel development OIDC session:

    vc env run -- sh -c 'node scripts/launch/qa.mjs --url "$1" --out launch-qa-artifacts' sh https://ai-saas-g2a5qfkso-invidias-codems-projects.vercel.app/en/launch

The script attaches the trusted OIDC token only to the exact allowed Preview
origin, blocks outside requests when token-enabled, never stores the token and
refuses to send it to production. The manually dispatched GitHub Actions
workflow has no privileged identity and cannot access protected previews
without valid server-side configuration. Do not broaden access for a test.

## Real Code Builder screenshots: operator-only

On a trusted development computer, sign in and create a disposable SAMPLE
app using only fake records, never private repositories or customer source.
After a real successful build, inspect the exact DOM element to be captured.
Run:

    node scripts/launch/capture-code-builder.mjs --url https://gen1e.xyz/en/code/builder --selector ".REVIEWED_SAFE_REGION" --out /tmp/lattice-captures

The operator must type CAPTURE SYNTHETIC before one selected DOM region is
captured. No browser storage state is exported; known sensitive selectors
are masked and visible credential/email patterns are checked. This is NOT
guaranteed sanitization: a second human must review/redact every image
before it is uploaded or used for launch.

## Manual launch gates (none are automatically signed off)

- [ ] Real sanitized Code Builder screenshots approved.
- [ ] Mobile Safari at 320/375/390px and desktop; both themes, keyboard,
      VoiceOver, reduced motion, contrast, links and layout.
- [ ] Product Hunt copy, truthful gallery, short demo clip, maker introduction.
- [ ] Publishing still in testing; Issue #479 remains release gate for sharing.
- [ ] New user: launch -> sign in -> Code Builder -> successful completed build.

Keep PR #488 unmerged until these are reviewed. Record only anonymized
test outcomes, not prompts, credentials, source, or account identifiers.
