# Self-Hosted Preflight & Smoke-Test Checklist

## Purpose

Define the preflight and smoke-test checklist for business self-hosted Lattice deployments.

This document answers the practical question:

## “How do we know a fresh install is actually usable?”

It should be used for:
- initial business installs
- deployment validation
- upgrade validation
- support/debug triage

---

## Two Layers of Validation

### Layer 1 — Preflight
Checks configuration and service connectivity before normal use.

Examples:
- env vars present
- DB reachable
- storage reachable
- auth configured
- required secrets present

### Layer 2 — Smoke test
Checks that real user workflows actually function.

Examples:
- can log in
- can create/access workspace
- can upload document
- can preview document
- can ask a document-backed query

Both layers are required for business install confidence.

---

## Preflight Checklist — Mode A Baseline

### Core app configuration
- [ ] `NEXT_PUBLIC_APP_URL` is set correctly
- [ ] `NODE_ENV` is set appropriately
- [ ] required app secrets are present
- [ ] internal cron/route secret(s) are set

### Authentication
- [ ] auth provider/config is present
- [ ] callback/redirect URLs are correct for deployment URL
- [ ] a test login path works or is at least configured correctly

### Database
- [ ] primary DB URL/config is present
- [ ] service-role/admin DB credential is present where required
- [ ] DB connection succeeds from app runtime
- [ ] migrations have been applied successfully

### Storage
- [ ] storage bucket/config is present
- [ ] app can write to storage
- [ ] app can read from storage
- [ ] signed upload path works if used

### Model/provider configuration
- [ ] at least one supported chat/reasoning provider is configured
- [ ] at least one supported embedding provider is configured
- [ ] fallback/provider selection behavior is understood

### Feature gating sanity
- [ ] disabled optional subsystems are not required by the baseline install path
- [ ] optional integrations missing from env do not break core product flows

---

## Smoke-Test Checklist — Mode A Baseline

### 1. App boot sanity
- [ ] app loads at public URL
- [ ] public routes render successfully
- [ ] authenticated app shell loads after login

### 2. Auth sanity
- [ ] a user can sign in
- [ ] a session is established
- [ ] access to authenticated surfaces is allowed

### 3. Workspace sanity
- [ ] a workspace can be created or accessed
- [ ] workspace-scoped routes load
- [ ] no onboarding loop or duplicate setup failure blocks first use

### 4. Document upload sanity
- [ ] a TXT/MD/PDF document can be uploaded
- [ ] upload completes without transport failure
- [ ] storage URI is created/persisted
- [ ] document appears in the workspace UI

### 5. Document preview sanity
- [ ] a warm uploaded document can be previewed
- [ ] preview returns readable extracted content
- [ ] personal-doc and workspace-doc behavior is both understood and working as applicable

### 6. Document-backed query sanity
- [ ] a document-backed question can be asked
- [ ] the model uses the uploaded document content, not just filename metadata
- [ ] no retrieval RPC mismatch prevents context injection

### 7. Basic memory/context sanity
- [ ] context assembly runs without fatal errors
- [ ] document context is included when expected
- [ ] no scope bleed is observed across workspaces/docs

### 8. Core API protection sanity
- [ ] protected internal/cron routes reject invalid auth
- [ ] protected internal/cron routes accept valid auth

---

## Recommended Smoke-Test Scenario

A good baseline business install should be able to pass this simple scenario:

1. deploy app and DB
2. configure auth and storage
3. sign in
4. create/access a workspace
5. upload a PDF
6. see it appear in the document list
7. preview the document
8. ask “Summarize the document I just uploaded”
9. receive a response grounded in actual document content

If that scenario fails, the install is not yet credibly ready.

---

## Failure Classification

When a preflight/smoke test fails, classify it clearly.

### Configuration failure
Examples:
- missing env vars
- malformed secret
- unsupported provider combo

### Dependency failure
Examples:
- DB not reachable
- storage not reachable
- auth callback mismatch

### Product workflow failure
Examples:
- upload succeeds but preview fails
- document exists but model cannot analyze it
- workspace creation loops or duplicates

### Scope/boundary failure
Examples:
- wrong workspace context
- personal-doc retrieval skipped incorrectly
- preview requires missing workspaceId when it should not

---

## Final Recommendation

A business install should only be considered healthy when it passes:
- config preflight
- dependency connectivity
- workspace/doc upload/preview/query smoke tests

That is the minimum bar for credible business self-hosting.
