# Lattice OS — Strategic Pilot Outreach (IP-Protected)

**Principle: Sell outcomes, not architecture. Black-box the secret sauce.**

---

## Core Positioning (What You Say Publicly)

> **"We deploy AI agents that actually remember your codebase, conventions, and tribal knowledge — across sessions, across repos, across months. They don't reset every conversation."**

> **"Free 8-week pilot in your VPC. You measure: PR review quality, incident MTTR, migration velocity. If it doesn't move the needle, we walk away."**

---

## What You NEVER Say (Internal Only)

| Never Say This | Say This Instead |
|----------------|------------------|
| "UCOL orchestration" | "Multi-step reasoning engine" |
| "Procedural + episodic memory (Supabase)" | "Persistent memory layer" |
| "DARE-TIES merge of Qwen2.5-Coder" | "Custom coding model, beats GPT-4 on our benchmarks" |
| "Hermes gateway + Bluesky agent" | "Native Slack/Discord/Telegram integration" |
| "66 skills synced via cron" | "Learns your patterns automatically" |
| "vLLM hosting on Modal" | "Deploys in your VPC, your GPUs, your data" |

---

## Revised Cold Email Templates

### Template A: Platform Companies (Vercel, Railway, Netlify)
```
Subject: AI agents that remember your deployment patterns?

Hi [Name],

v0 and the AI SDK are the right direction — but every session starts from zero. 
Agents don't learn your team's conventions, your weird Terraform quirks, 
or that one migration that broke prod last March.

We run a **3-design-partner pilot (free, 8 weeks, your VPC)** with platform teams.

What the agent does:
- Reviews PRs with full codebase context (not just the diff)
- Catches the N+1 queries, missing indexes, breaking changes *before* merge
- Remembers every fix — applies the pattern automatically next time
- Handles build failures: reads logs, writes fix, opens draft PR

Pilot scope: Connect GitHub + Slack. Agent reviews 50 PRs/week. 
You measure: false positive rate, time saved, patterns learned.

Worth a 15-min call? I'll send a 90-sec demo video first.

Best,
[Your name]
```

### Template B: DevTools (Cursor, Linear, Height, Sourcegraph)
```
Subject: The memory layer your AI features are missing

Hi [Name],

[Company]'s [Cursor Tab / Linear AI / Cody] is impressive. 
The gap every devtool hits: **agents that actually remember**.

Not RAG. Not context stuffing. Persistent memory that:
- Learns your codebase once → applies forever
- Survives context window limits
- Compounds: every PR reviewed makes the next one better

We're running a **3-design-partner pilot (free, 8 weeks, your VPC)**.

Pilot: We deploy, connect to your repos/Slack. 
Agent handles [code reviews / sprint planning / incident response].
You own all generated code/data. Zero training on your data.

15-min call? Demo video first.

Best,
[Your name]
```

### Template C: Enterprise/Fintech (Stripe, Datadog, Coinbase, etc.)
```
Subject: AI agents that don't forget your architecture

Hi [Name],

Most AI coding tools are goldfish — no memory, no learning, reset every session.

We built agents that remember: your architecture decisions, 
your convention quirks, your tribal knowledge. 
Deploy in your VPC. Your GPUs. Your data never leaves.

**3-design-partner pilot (free, 8 weeks).**

Pilot agents (pick 1-2):
- Code Review: catches bugs your seniors miss, learns patterns
- Incident Response: correlates logs → root cause → runbook → fix branch
- Migration Assistant: plans + executes large refactors (tested, reviewed)
- Compliance/Docs: keeps architecture docs in sync with code

You measure: MTTR, PR review velocity, migration success rate.

Worth a conversation?

Best,
[Your name]
```

---

## Demo Video Script (90 seconds — No Architecture)

| Time | Show (Don't Tell) |
|------|-------------------|
| 0-15s | **Problem**: Open PR → current AI misses N+1 query because it doesn't know the ORM pattern |
| 15-45s | **Solution**: Same PR → Lattice agent flags it: "Pattern from PR #247: batch this query" → writes fix → opens draft PR |
| 45-75s | **Persistence**: New PR 3 weeks later → agent applies same pattern automatically without being asked |
| 75-90s | **Pilot offer**: "Free 8 weeks, your VPC, you measure outcomes" |

**Never show**: Architecture diagrams, memory tables, model merge config, UCOL flowcharts.

---

## Pilot Agreement (IP-Safe)

```
LATTICE OS DESIGN PARTNER AGREEMENT

Parties: Lattice OS ("Provider") + [Company] ("Partner")

Term: 8 weeks from deployment (auto-expires, no auto-renew)

Deployment: Provider deploys in Partner VPC (Partner's cloud account).
            Provider has SSH access for install only. 
            All models, data, memory run in Partner VPC.
            Provider never accesses Partner code/data.

Scope: 1-2 agents configured for: [Code Review / Incident Response / Migrations / Docs]
       Weekly 30-min sync. Shared Slack channel.

Provider Delivers:
- Working agents that complete defined tasks
- Weekly metrics report (completion rate, time saved, patterns learned)
- Full source for pilot agent configs (not core platform)

Partner Provides:
- VPC access (install only), GitHub/Slack/Datadog read+write
- ~2 hrs/week engineering feedback
- Success metrics defined Week 1

IP: 
- Partner owns ALL code, data, memory generated during pilot
- Provider retains core platform IP (orchestration, memory, model serving)
- No reverse engineering, no copying core platform components
- No training on Partner data

Data: Zero training on Partner data. All inference in Partner VPC.

Exit: Either party, 1-week notice. No liability. Partner keeps everything.

Post-Pilot: Separate commercial agreement if continuing.
```

---

## Objection Handling (IP-Safe)

| Objection | Response |
|-----------|----------|
| "How does memory work?" | "Persistent layer that compiles patterns from every interaction. Technical details under NDA post-pilot." |
| "What model?" | "Custom coding model, beats GPT-4 on our benchmarks. Runs on your GPUs." |
| "We have Copilot" | "Copilot doesn't remember. Our agents learn your codebase once, apply forever. Complementary." |
| "Data privacy" | "Deploys in YOUR VPC. We never see your code. Your GPUs, your network, your data." |
| "Too early" | "Free pilot, your VPC, you measure outcomes. Zero risk." |
| "Need SOC2" | "Inherits your VPC controls. Modal (our GPU provider) is SOC2. We don't touch your data." |
| "Can we self-host later?" | "Yes. Pilot proves value. Enterprise = self-hosted platform license." |

---

## Target Prioritization (Strategic Order)

| Priority | Company | Why | Approach |
|----------|---------|-----|----------|
| 1 | **Inngest** | Already in stack. Warm. Tony/Tyler know the space. | Direct — "Extend what we already use" |
| 2 | **Modal** | GPU partner. Erik/Austin technical. Mutual benefit. | Direct — "Showcase for Modal GPUs" |
| 3 | **Railway/Render** | Platform eng, self-serve infra, fast decisions | Warm intro via investor |
| 4 | **Linear/Height** | Small, technical, AI-native, CEO accessible | Cold + investor intro |
| 5 | **Temporal** | Durable execution + AI = perfect match | Via investor (Sequoia/Benchmark) |
| 6 | **Vercel** | Highest strategic value. Hardest to reach. | Wait for warm intro. Don't burn cold. |
| 7 | **Supabase/Sourcegraph** | Strong technical fit. Large org = slower. | Warm intro only |
| 8 | **Attio** | CRM + AI, small team, fast | Cold okay (CEO technical) |
| 9 | **Stripe/Datadog/Coinbase** | Enterprise — long sales cycle. | Only via warm intro. Skip cold. |

**Rule: No cold to Vercel/Stripe/Datadog. Only warm intros.**

---

## This Week's Actions (Revised)

- [ ] **Inngest**: DM Tony — "What if Inngest functions had persistent memory?"
- [ ] **Modal**: DM Erik — "Lattice on Modal GPUs = showcase for you, pilot for us"
- [ ] **3 Investors**: Ask for intros to Railway, Linear, Temporal
- [ ] **Record 90-sec demo** (screen only, no architecture)
- [ ] **Deploy Lattice-1 to Modal vLLM** (get HTTPS URL for demo)
- [ ] **Zero cold emails until 3 warm intros secured**

---

## Success Metrics (Partner-Facing, Not Technical)

| Metric | Target | How Partner Measures |
|--------|--------|---------------------|
| PR review completion | >80% | % of assigned PRs reviewed |
| False positive rate | <15% | Engineer: "This was noise" |
| Time saved per review | >10 min | Self-report / timestamp diff |
| Patterns learned & reused | >5/week | Agent applies prior fix automatically |
| Incident MTTR reduction | >30% | PagerDuty timestamps |
| Pilot continuation rate | 100% | All 3 convert to paid |

---

*Internal use only. Do not share with prospects.*
*Updated: 2026-06-16*