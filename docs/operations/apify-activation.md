# Apify acquisition activation

Only `automation-lab/threads-scraper` is registered. Other social platforms
remain unsupported until their own actors and normalizers are reviewed.

## Server configuration

| Runtime | Variable | Purpose |
| --- | --- | --- |
| Vercel Production | `APIFY_API_TOKEN` | Authenticate provider calls |
| Vercel Production | `APIFY_WEBHOOK_SECRET` | Authenticate terminal callbacks |
| Trigger.dev Production | `APIFY_API_TOKEN` | Read completed runs and collect datasets |

Vercel variables must use the Secret/sensitive type. Neither value may use a
`NEXT_PUBLIC_` prefix. The Apify account ID is an identity check, not an actor ID
or credential; no application environment variable is needed for it.

The Trigger worker runs independently of Vercel. Configure its token through
the Trigger.dev production environment or deploy from an environment where the
validated `APIFY_API_TOKEN` is available. `trigger.config.ts` synchronizes it
when present. Vercel environment changes alone do not update an existing worker.

## Terminal callback

- URL: `https://gen1e.xyz/api/webhooks/apify`
- Apify actor condition: `yacNYZpu9F3C8EATQ` (`automation-lab/threads-scraper`).
- Events: `ACTOR.RUN.SUCCEEDED`, `ACTOR.RUN.FAILED`, `ACTOR.RUN.TIMED_OUT`,
  `ACTOR.RUN.ABORTED`.
- Header template: JSON containing `x-lattice-apify-secret`, with the same
  secret as Vercel's `APIFY_WEBHOOK_SECRET`.
- Delivery retries enabled; SSL verification enabled.
- Payload template:

```text
{"eventType":{{eventType}},"actorRunId":{{eventData.actorRunId}},"actorId":{{eventData.actorId}},"createdAt":{{createdAt}}}
```

The exact webhook path bypasses Clerk identity checks; its route handler still
requires the dedicated secret. Neighboring paths remain protected. A malformed
body with the correct secret should return 400; a missing or wrong secret
should return 401. Neither probe should read the database or dispatch a task.

## Actor build verification

Build `1.0.23` does not exist. On 2026-10-18 the Apify input-validation API
rejected it with `build-not-found`. Pinned build `0.1.47`
(`Bvw2Tdc5vefm3M5Wv`) was `SUCCEEDED`, and the same profile input validated.
Its published dataset schema contains nullable fields, Unix timestamps in
seconds, `photo` media, and separate video URLs. The normalizer validates these
forms; the original actor rows remain in raw evidence.

## Activation sequence

1. Review and merge the activation patch. Confirm its Vercel production deploy.
2. Configure the token in Trigger project `proj_nrmfrudcizidgnsdgzox`, production
   environment, and deploy the reviewed revision with
   `pnpm exec trigger.dev deploy --env prod`.
3. Run the two callback authentication probes above. A Clerk JSON 401 even with
   the correct header means the proxy change has not reached production.
4. Verify the acquisition migrations, including normalized evidence, are applied
   before launching a paid acquisition.
5. Persist one owner-scoped acquisition request and provider run, then verify
   one public-resource acquisition through callback, ingestion, normalization,
   provenance, owner isolation, replay, and final cost reconciliation.

The smoke-test authority is one actor run, at most $0.10 and 25 records, with
launch retries disabled. Refuse before launch if current pricing cannot fit.
Use a small record limit (3–5) for the first proof. Empty/refusal outcomes must
remain explicit; a successful provider run alone is not completed research.

## Configuration record — 2026-10-18

- Account authentication succeeded and matched the supplied account ID.
- Both Vercel production secrets were created as sensitive variables.
- Terminal webhook `m0RYzr6frhe1kBWgd` was created with the configuration above.
- Existing reviewed commit `140fa163` was redeployed with the secrets;
  deployment `dpl_BSzCsZ2FTfYbHErcKT5yvr3vqqfo` reached `READY`.
- All four acquisition tables and normalization bookkeeping columns were
  verified in production. Every acquisition table has RLS enabled, no table
  access for `anon`/`authenticated`, and service-role access.
- The worker's environment/deployment and a paid end-to-end acquisition were
  not verified during configuration. No paid actor run was launched.

API references: [input validation](https://docs.apify.com/api/v2/actor-validate-input-post),
[webhook templates](https://docs.apify.com/integrations/webhooks/actions),
[Trigger environment variables](https://trigger.dev/docs/deploy-environment-variables).
