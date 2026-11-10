# Lattice OS — Mineral / Copper one-page-at-a-time rollout

Status: design migration inventory, not a directive to modify all pages.
Baseline: /en/launch is the approved style reference. Its native logo
(`public/lattice-logo.png`) replaces the temporary triangle in this slice.

## Visual rules for every subsequent PR
- Build from current main, one primary route at a time, no broad find/replace.
- Mineral Ink #101916, Limestone #F2EFE5, Forest Green #34755D,
  Copper #CD7A53, Mist Sage #A5B7A6; dark base #0D1511 and panel #17251D.
- Original Lattice logo asset, accessible name, no invented logo glyph.
- Use existing tokens/components; avoid replacing established layout routing,
  auth, data access, database policies, streaming, billing, sandbox security.
- Minimum screenshot matrix: 320, 375, 390, 768, 1440px; light/dark,
  iPhone Safari when available, keyboard, text scaling, overflow, focus,
  reduced motion and screen-reader labels.
- Before/after UI QA and route-specific regression tests required.
- Treat authenticated screenshots as sensitive; no user workspace contents
  or secrets in PR artifacts. Synthetic fixtures only.
- Publish one PR; review, smoke test and approve before next page.
- Production flags ENABLE_PREVIEW_SHARING and ENABLE_PREVIEW_SANDBOX must
  not be altered by visual-only changes; Issue #479 is a separate security gate.

## Priority route inventory (each line is a separate page/slice)

### P0: Approved reference and public-to-product funnel
- [x] /en/launch — Mineral/Copper baseline; native logo swap proposed (this PR).
- [ ] / and /en — public homepage; today proxy.ts rewrites to
      /en/expert/v/{a,b,c} using a 30-day variant cookie. Separate approval
      for changing default homepage routing/A-B experiments.
      Inspect app/[locale]/(landing)/page.tsx,
      components/landing/product-hunt-launch.tsx,
      components/landing/navbar.tsx and shared landing layout.
- [ ] /en/sign-in — Clerk/auth layout and sign-in appearance.
- [ ] /en/sign-up — Clerk/auth layout and sign-up appearance.
- [ ] /en/onboarding — new-account wizard; protect setup/progress.
- [ ] /en/onboarding/building — onboarding build progression.

### P1: Core authenticated experience
- [ ] Dashboard shared navigation and sidebar SHELL — do as a dedicated
      cross-route review, not as an incidental CSS edit. Inspect
      components/navbar.tsx, components/SidebarClient.tsx,
      components/mobile-sidebar.tsx, app/[locale]/(dashboard)/layout.tsx.
- [ ] /en/workspaces — workspace discovery/list, empty/loading/error cards.
- [ ] /en/workspaces/[id] — workspace overview, membership state.
- [ ] /en/code/builder — CodeBuilderIsland: prompt, Plan/Code tabs,
      streaming, durable run recovery and Preview/Code/Logs states.
- [ ] /en/code — generation entry page.
- [ ] /en/workspaces/[id]/conversation — workspace conversation, tools,
      model/agent selection and long-running streaming controls.
- [ ] /en/conversation — conversation entry/resolver.
- [ ] /en/conversation/[id] — existing conversation recall and continuity.
- [ ] /en/settings — integrations and GitHub status/connect/reconnect.
      Preserve mobile GitHub modal width; zero horizontal scrolling.
- [ ] /en/previews/[previewId] — owner-only Preview/Code/Logs; do not
      reclassify exposed Sandbox URL as private or change security gates.

### P2: Workspaces, agents and creator tools
- [ ] /en/workspaces/[id]/settings — permissions and membership.
- [ ] /en/workspaces/[id]/memory — workspace-scoped memory.
- [ ] /en/memory-center — memory search and management.
- [ ] /en/creator — creator workspace.
- [ ] /en/expert/[id] — expert-specific details.
- [ ] /en/image — image workspace.
- [ ] /en/video — video workspace.
- [ ] /en/music — music workspace.
- [ ] /en/settings/data — storage and data controls.
- [ ] /en/settings/local-capabilities — local runtime authority.
- [ ] /en/settings/partner-keys — partner keys, secret visibility.
- [ ] /en/settings/vault — credentials vault; never display real keys.
- [ ] /en/telemetry — instrumentation page.

### P3: Public information and acquisition
- [ ] /en/pricing — replace synthetic gradient logo, preserve checkout logic.
- [ ] /en/downloads — distribution/installer page, platform detection.
- [ ] /en/downloads/[platform] — Windows, Linux, macOS.
- [ ] /en/docs — documentation.
- [ ] /en/blog — blog listing.
- [ ] /en/blog/[slug] — article reading.
- [ ] /en/blog/series/[slug] — article series.
- [ ] /en/support — support forms and contact options.
- [ ] /en/privacy — legal/privacy copy must remain intact.
- [ ] /en/expert — enterprise expert landing.
- [ ] /en/expert/v/[variant] — the three existing homepage variants,
      preserve experiment configuration unless specifically approved.
- [ ] /en/explore — product discovery index.
- [ ] /en/explore/[feature] — feature-specific landing pages.
- [ ] /en/slack — integration marketing.
- [ ] /en/sovereign — local/offline/sovereign product marketing.
- [ ] /en/checkout/success — post-payment, verify fulfillment.
- [ ] /en/beta — beta landing.
- [ ] /en/beta/[guideId] — beta guide.
- [ ] /en/creators/apply — creator application workflow.

### P4: Admin and special surfaces (later, separately gated)
- [ ] /en/admin/analytics, /harness, /logs, /otel — privileged reporting.
- [ ] /en/agent/[id] — agent view.
- [ ] /en/desktop-login — native desktop login handoff.
- [ ] /en/test-wizard — internal test wizard; verify exposure policy.
- [ ] /en/not-found — empty/error surface.
- [ ] /en/under-construction/code and /conversation — legacy placeholders.
- [ ] /relay, /relay/routing, /relay/workflows — independent control-plane UI.
- [ ] /weaver, /weaver/onboarding — specialized agent surfaces.
- [ ] /preview/share/[shareId] — must remain security-gated; do not
      open public publishing as a byproduct of a design PR.

## Recommended starting order
Current slice: use the actual logo on /en/launch.
Next proposed slice: public homepage (/en) including mobile navbar and
existing expert variant routing, but only after approval of the homepage
default behavior. Follow with sign-in, sign-up and onboarding, then dashboard
shell and high-frequency core product routes one by one.

## Agent handoff / non-negotiable gates
For every slice, first open the actual route and trace shared components.
Change only this route and truly necessary shared tokens; include a before/
after screenshot matrix and exact affected routes. Test empty/loading/error
states, authorization, mobile Safari, a11y, dark/light, and relevant contracts.
No merge or production rollout without user approval. Keep existing feature
flags, auth/OAuth logic, AI model routing and tenant boundaries untouched.
