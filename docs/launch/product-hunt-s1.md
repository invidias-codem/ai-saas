# Lattice OS Product Hunt — Launch Experience S1

## Purpose
Help first-time visitors understand Lattice in five seconds and try Code
Builder within one click. The Lattice product narrative is **idea → reviewable
code → tested app**, with collaborative AI workspaces as the connective
layer. Product Hunt traffic should encounter a tangible demonstration rather
than a broad platform terminology overview.

## Scope of this first PR
- Replace the homepage's unrelated expert/roster-heavy content with a focused
  first-run hero, interactive local demo, three-step workflow, and credible
  release-status disclosure.
- Preserve the existing landing layout, InstallProvider, footer, sign-in and
  existing public routes. The authenticated dashboard remains unchanged.
- Simplify the homepage navigation only; other public pages retain their menu.
- Keep language direct and accessibility first: 320px mobile, 48px CTAs,
  keyboard navigation, reduced-motion-friendly static transitions.
- Demo is **illustrative**, not a live sandbox. No fabricated usage metrics,
  testimonials, production shareability, or inapplicable badges.
- No Mobbin screenshot, component, or proprietary UI asset is used. Interface
  designed independently with original Lattice styling.

## Product Hunt guidance checked (November 9, 2026)
Official guide emphasizes plain language, an actual working product, media
showing the app, and an authentic maker comment. A draft launch can be
scheduled up to one month in advance. Do not request upvotes; ask for feedback.
Product Hunt's launch editor allows a gallery image, YouTube video, or a
clickable demo. Link directly to the homepage and verify browser login.

Sources:
- https://help.producthunt.com/en/articles/17350772-launch-guide
- https://help.producthunt.com/en/articles/17834537-4-build-your-product-page
- https://help.producthunt.com/en/articles/17734384-5-how-to-promote-your-launch-and-what-to-avoid

## Proposed Product Hunt submission (draft, verify against launch UI)
- Product: Lattice OS
- Tagline: **Build software with AI. Keep it yours.**
- Description: Turn an idea into reviewable code and an app you can test.
  Lattice OS combines Code Builder and conversational workspaces so you can
  build, refine, and keep control of your project.
- Audiences: creators, indie hackers, and consultants prototyping small apps.
- Conversion: completed first Code Builder project, not registrations alone.
- Maker question: "Where do you get stuck between an idea and a working app?"

## Release checklist
1. Main build/lint/tests, CodeQL, Playwright at 320/390/768/1440px.
2. Light/dark appearance, keyboard/focus and screen reader labels.
3. Sign-in → Code Builder, demo toggle and support CTA end-to-end.
4. Confirm actual Code Builder runs and isolated preview qualification.
5. Capture REAL screenshots for gallery at recommended 1270×760px and square
   icon; optional 45–75s no-hype maker walkthrough, not a synthetic demo.
6. Confirm all locales (this slice's new launch marketing copy is English;
   schedule translations before using non-English launch links).
7. Review SEO metadata, analytics consent, PH tracking and feedback funnel.
8. Prepare a maker comment and early user interviews; no upvote incentives.
9. Launch timing selected only after product smoke tests and approval.

## Follow-up
S2: Qualified product walkthrough using recorded, consented real test session
(never fake production preview).
S3: Gallery/video production and signup/onboarding conversion instrumentation.
S4: Public-ready publishing flow only after private ingress issue #479 closes.
