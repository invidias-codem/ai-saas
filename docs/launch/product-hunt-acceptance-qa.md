# Product Hunt launch acceptance — executable QA

This QA workflow is stacked on PR #488. It does NOT modify the finished
Mineral/Copper launch design, change production feature flags or merge the PR.

## Public page checks and screenshots

The existing repository dependency Playwright supports Chromium and WebKit.
Install local browser binaries (once):

    pnpm exec playwright install chromium webkit

Run against the precise Vercel Preview URL shown on PR #488:

    LAUNCH_QA_BASE_URL=https://YOUR-PR-PREVIEW.vercel.app pnpm qa:launch

The runner inspects 320px, 375px, 390px, and 1440px in both color themes.
It verifies HTTP 200 (not an SSO login page), launch heading, pre-launch
noindex, Code Builder CTAs, visible unclipped controls, no horizontal page
overflow, all three guided walkthrough steps, and the theme switch.

Evidence: eight full-page PNGs and a JSON report are written to the OS
temporary folder named lattice-launch-qa. This folder is outside the repo.

For browser-level WebKit approximation:

    LAUNCH_QA_BROWSER=webkit LAUNCH_QA_BASE_URL=https://YOUR-PR-PREVIEW.vercel.app pnpm qa:launch

WebKit on a desktop is NOT physical iOS Safari QA. Check on actual Safari
phones at 320, 375 and 390px; also perform VoiceOver, keyboard navigation,
reduced-motion, legibility, link routing, and contrast checks.

For an access-protected Vercel Preview, use a short-lived VERCEL_OIDC_TOKEN
from your own authenticated Vercel CLI session, scoped to the same project.
The runner only forwards the trusted-source token to the preview origin,
never to Clerk, third-party scripts or external hostnames. Do not copy a
token into repository files, issue comments or shell commands.

## Optional authenticated product screenshots

Use a dedicated test account and ONLY synthetic/example projects. Never
capture real client data, private workspaces, keys or proprietary code.
Provide a locally stored Playwright authenticated storage state via a
private environment variable, not a checked-in file.

    LAUNCH_QA_BASE_URL=https://YOUR-PR-PREVIEW.vercel.app
    LATTICE_QA_STORAGE_STATE=/private/synthetic-test-auth.json
    LATTICE_QA_SYNTHETIC_ONLY=yes
    pnpm qa:launch --capture-builder

The default authenticated test fills a fictional prompt and takes a local
screenshot of the existing Code Builder UI. It does not submit a job.

To launch one real AI generation, obtain explicit owner consent and an
available test-credit allowance. Then add BOTH a charge-approval environment
variable and an explicit command flag:

    LATTICE_QA_ALLOW_BUILD_CHARGES=yes pnpm qa:launch --capture-builder --run-build

This can consume inference credits. It waits for saved generated files for
up to 12 minutes. Run only in a dedicated synthetic account. Screenshot
filenames are marked REVIEW-BEFORE-SHARING because even demo AI output must
be inspected and any user-identifying information removed before publication.

Do not commit authenticated storage-state JSON, screenshots, prompt data,
tokens, or login session cookies. If the test cannot authenticate, fails,
or the generation never completes, record the failure rather than faking
an acceptance screenshot.

## Product Hunt launch material drafts (not approved)

Product name: Lattice OS
Tagline candidate: Build software with AI. Keep the context.
Working description: Turn an idea into a software project you can plan,
generate and inspect with Code Builder and a connected AI workspace.

Maker introduction candidate:
    We built Lattice OS because an idea deserves more than a one-off AI
    response. Start with what you want to create, generate a project and
    inspect the code as you keep working. We're inviting early makers,
    freelancers and small teams to try the workflow, tell us what breaks
    and help shape what we build next.

Still needed: approved icon, real on-product screenshots, demo recording
without fabricated output, clear FAQ, early-user invitation, and final
Product Hunt submission field validation. Don't imply private publishing,
protected Sandbox URLs, broad GitHub write integration or live Mobbin
research are already in general release.

## Five acceptance sign-offs

- [ ] Real Code Builder captures independently inspected and sanitized
- [ ] Deployed Preview QA, physical Safari, desktop and accessibility reviewed
- [ ] Product Hunt assets, maker post and claim wording approved
- [ ] Production sharing remains off while issue #479 is unresolved
- [ ] Launch to sign-in to first successful, persisted build verified

Until all five are signed off, do not merge PR #488 or describe the
candidate as launch-ready. GitHub draft:false and a title containing
(draft) are not merge-protection controls. Check repository approval
settings separately. All generated screenshots require human review.
