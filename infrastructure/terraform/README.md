# Terraform foundation (IP1a)

This directory deliberately contains only a local, credential-free fixture.
It does not own or provision any real infrastructure. Existing deployment
workflows and account compute remain unchanged. See the
[architecture and adoption gates](../../docs/architecture/infrastructure-plane.md).

Terraform CLI: 1.16.7 (pinned for reproducibility; review upgrades before adoption).
From repository root, using the installed CLI:

```sh
terraform fmt -check -recursive infrastructure/terraform
terraform -chdir=infrastructure/terraform/fixtures/ownership init -backend=false -input=false
terraform -chdir=infrastructure/terraform/fixtures/ownership validate
terraform -chdir=infrastructure/terraform/fixtures/ownership test -no-color
```

All tests use command = plan; there are no external providers, provisioners,
data sources, backend credentials, or apply workflows. The fixture accepts
only a synthetic sandbox environment and records an example ownership contract
using Terraform's built-in terraform_data resource. This is not a security
boundary or an implementation of the future approval service.

The validation-only GitHub Actions workflow has no cloud secrets or OIDC
permissions. Do not add real provider roots to the fixture. Future roots require
separate CI checks and provider lock files, independent trust review, and
operator-controlled state and credentials.

Do not commit any state, saved plans, real tfvars, backend config, credentials,
or plan JSON. Keep provider .terraform.lock.hcl files tracked when introduced.
No real cloud state backend, apply, import or destroy is authorized by IP1a.

## Provider qualification and consolidation

This root remains the canonical provider-neutral fixture and does not select a
cloud. GCP (#543), OCI and DigitalOcean are candidates, not qualified adapters.
Complete TF-1A.1P (economics and security evidence) before provider selection,
account attachment or live state bootstrap. Keep each provider root separate;
do not add a second GCS state implementation. The earlier TF-1A/TF-1A.1 local
packages used Terraform 1.12.2; the repository fixture uses 1.16.7. Revalidate
ported roots with the repository-pinned CLI and their reviewed lockfiles. No
live apply or credential changes are authorized by this reconciliation.
