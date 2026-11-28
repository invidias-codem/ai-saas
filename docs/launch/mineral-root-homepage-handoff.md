# Homepage Mineral / Copper migration — one-route implementation

## Scope
Canonical public homepage \`/\` / \`/en\` replaces sticky A/B/C root rewrite.
Preserve \`/en/expert/v/a\`, \`/en/expert/v/b\`, \`/en/expert/v/c\`
and their localizations. Do not change these deep-link pages or edit
homepage experiments by reusing the old variant middleware.

This PR is **stacked on PR #493**, which installs the real first-party Lattice
logo. Merge/approve #493 first, then rebase or retarget this PR to main and
verify the diff again. Do not merge to production without authorization.

## Changes
- Remove the root-only \`lattice_landing_variant\` rewrite and cookie mutation
  from proxy.ts. All other Clerk, referral, guest, API, intl logic untouched.
- Move locale root page out of \`(landing)\` and into \`(launch)\` so the
  approved \`MineralLaunch\` navbar and footer are not duplicated.
- Root page has canonical \`/en\` and is indexable; \`/en/launch\` remains
  \`noindex\`.
- For the moment, untranslated locale roots redirect to \`/en\` rather than
  falsely presenting English text under a different language. Add approved
  localized variants later in a separate slice.
- Contract tests assert root rendering, first-party logo, direct variants,
  `noindex` separation, and removal of the root A/B cookie.

## Required acceptance / smoke matrix
1. \`/\` → locale middleware → \`/en\`, **single** Mineral/Copper header/footer.
2. \`/en\`, \`/en/\`, \`/en/launch\` render; direct expert variants a/b/c work.
3. Check prior A/B cookie no longer affects homepage and no new A/B cookie
   is set. Deep-linked expert variants continue to work without cookie.
4. Test referrals \`?ref=...\`: first touch capture still works and no cookie
   regression; avoid logging referral tokens or personal data.
5. Check \`/th\`, \`/vi\`, \`/es\`, \`/fr\`, \`/de\` redirect safely to \`/en\`
   until translations are implemented; no loops or misleading hreflang.
6. Responsive 320, 375, 390, 768, 1440px, light/dark, Safari, keyboard,
   VoiceOver, RTL safety where relevant and no horizontal overflow.
7. Confirm Code Builder CTAs navigate to \`/en/code/builder\` and sign-in
   still works for a new user.
8. Build/Lint/Test, CodeQL, protected Preview smoke and security review.
9. Preserve publishing/sharing flags OFF while Issue #479 remains unresolved.
10. Confirm shared pricing/install menus remain accessible from public
    supporting pages; assess whether a dedicated homepage downloads link
    is required before release.

## Important coordination note
As of branch creation, GitHub main still has the pre-redesign
ExpertLandingLayout and did not contain the reported locally accepted
Mineral/Copper Expert A/B/C component. This PR deliberately leaves their
files intact; incorporate the accepted Expert redesign independently,
without silently overwriting unpushed local changes.

## Rollback
Revert this PR (restore the old root landing page under \`(landing)\` and
its middleware variant rewrite), with confirmation that no other commits
changed those same routes in the interim. The first-party logo PR can remain.

Stop and submit screenshots, CI results, direct-route and callback tests
for review before merging or altering production configuration.
