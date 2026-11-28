# IP1b — nonproduction GCS remote state bootstrap

**Draft, not authorized for live use.** No project, budget or provider access
has been approved. The project naming validation is a guardrail, not proof
of environment isolation. Do not run against any existing application project.

## Scope

One regional GCS bucket and one bucket-scoped IAM member for an existing
dedicated service account in the same project. No project creation, API enablement,
service-account creation, key creation, WIF, project IAM changes or production
resource adoption. Google-managed encryption at rest is the default; no
customer-managed KMS is configured. Versioning, uniform access, public access
prevention, force_destroy=false and prevent_destroy protect the state bucket.
The objectAdmin role permits object deletion (needed for lock release); it
does not grant bucket administration. Inherited IAM and audit configuration
must be checked independently.

No real provider credentials are needed for the plan-only mocked tests.
The exact provider version is pinned, but the signed provider lock file
must be generated, reviewed and committed before live use. Run
terraform providers lock with the approved platforms using the official registry;
verify signature/trust and commit .terraform.lock.hcl. Never copy guessed
hashes or allow unreviewed provider changes. CI generates a candidate lock for
Linux amd64, macOS arm64/amd64 and Windows amd64 when none is tracked. It logs
only public provider lock metadata and initializes with -lockfile=readonly.
Once the reviewed lock is committed, CI verifies read-only initialization and
rejects changes to that lock during cross-platform checksum verification. A
candidate-only green run does not satisfy Gate A. CI is not the live apply path.

## Gate A — operator prerequisites (all required)

- Human-reviewed merge of IP1a and this PR; all relevant CI green.
- Live read-only inventory and verified dedicated nonproduction project ID,
  owner, region, billing account and approved spend ceiling. Configure budget
  alerts; budgets are alerts, not hard caps.
- Storage API enabled, existing dedicated state writer service account, no
  long-lived keys; operator-controlled ADC or service account impersonation.
- Separate bootstrap operator and state writer identities. Bootstrap operator
  has only the required bucket creation and IAM rights in the dedicated project.
- Verify inherited IAM, organization policy, data-access audit logs, provider
  lock file, backup/recovery procedure, and absence of existing conflicting bucket.
- Run in a private encrypted operator workspace, not a public CI runner.
  No plans, local state, backend configuration or credentials in Git or LLM context.

## Gate B — review-only bootstrap

From this directory, after Gate A, initialize with
`terraform init -lockfile=readonly`. Provide project_id, location and
state_writer_account_id in a private ignored tfvars file. Create a saved plan
with `terraform plan -input=false -out=bootstrap.tfplan`. Review privately:
exactly one bucket and one IAM member to create; no delete, replace, unrelated
changes or existing resource adoption. Verify cloud target and digest against
operator approval. A separately approved operator applies that exact saved plan
only. Abort on drift, approval expiry, or any mismatch; never bypass locking.

The bootstrap starts with local state because the remote bucket does not yet
exist. Protect it with encrypted local storage and an independent encrypted
backup; never discard it. Decide and test a separate protected bootstrap
state location before leaving the pilot. Do not create a circular dependency
by treating the bucket as disposable. The fixture cannot destroy the backend.

## Gate C — independently qualify remote state

Use the separate fixtures/remote-state-smoke directory with a fresh dedicated
prefix such as qualification/<approved-run-id>. Initialize its partial GCS
backend with the approved bucket and prefix via a private ignored .tfbackend
file. Use the state writer identity; the smoke root has no cloud resource
provider. Review and apply its saved plan only after approval. The marker
writes state to GCS, not a cloud compute resource.

1. Read the bucket through an independent GCP API/CLI identity and confirm
   project, region, encryption, uniform access, public access prevention,
   versioning, effective IAM and audit logs.
2. Confirm the remote object is present and Terraform can read the same state
   from a second clean workspace with the same backend configuration.
3. Test concurrent writers on the same disposable prefix with a controlled
   harness holding a lock; a second plan with -lock-timeout=5s must fail
   while the lock is held and succeed after normal release. Do not use
   -lock=false or force-unlock to manufacture success.
4. Exercise object-version recovery on a disposable prefix only, with all
   writers stopped, preserving current and previous generations. Verify
   restored state lineage/serial and the expected Terraform plan before resume.
5. Verify a separate unauthorized principal cannot list/read/write state.
6. Reconcile cost and audit events; retain sanitized evidence (commit, tool
   versions, target, timestamps, results and plan digest, no raw state).
7. Remove only the disposable marker under approved cleanup. Preserve the
   bucket, bootstrap state and evidence. No automatic lifecycle deletion
   of historical state or retention policy that blocks lock removal.

No live locking, recovery, IAM or billing guarantee follows from mocked tests.
Record each gate's evidence and obtain operator acceptance before IP2.

References:
- https://developer.hashicorp.com/terraform/language/backend/gcs
- https://docs.cloud.google.com/docs/terraform/resource-management/store-state

## Reconciliation (TF-1A)

The candidate Google 7.30.0 cross-platform lockfile from TF-1A has been
carried into this canonical root. It was generated with Terraform 1.12.2;
CI must independently verify it with repository-pinned 1.16.7. Signing-key
trust and provider review remain required. This stack is a candidate only:
provider selection, project naming and state-writer scope must be reconciled
with TF-1A.1 before live use. No cloud attachment or apply authorized.
