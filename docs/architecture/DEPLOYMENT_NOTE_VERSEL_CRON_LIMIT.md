# Deployment Note: Vercel Hobby Cron Limit

## Problem
Deployments on the current Vercel account fail because the project defines an hourly cron job in `vercel.json`:

- `/api/cron/refresh-truth-scores` → `0 * * * *`

Vercel Hobby accounts only allow cron schedules that run at most once per day.

## Current Failure
The deployment error is:

> Hobby accounts are limited to daily cron jobs. This cron expression (`0 * * * *`) would run more than once per day.

## Important Context
This deployment failure is independent of the Phase 1 architecture/security refactor. The refactor touched:
- `docs/architecture/PHASE1_TRANSITION_PLAN.md`
- `lib/core-api/protectedRoute.ts`
- `app/api/conversation/route.ts`

It did **not** introduce or modify Vercel cron configuration.

## Options
### Option A — Stay on Hobby
Change the hourly cron to a daily schedule temporarily.

### Option B — Upgrade Vercel plan
Keep the hourly schedule and upgrade the account to Pro.

### Option C — Move high-frequency jobs off Vercel Cron
Run high-frequency jobs via another scheduler:
- GitHub Actions
- OpenClaw heartbeat/cron
- external scheduler
- Firebase / Cloud scheduler equivalent

## Recommendation
For cost-conscious operation, move high-frequency internal jobs off Vercel Cron and keep Vercel cron limited to daily tasks. This aligns better with platform constraints and reduces deploy friction.
