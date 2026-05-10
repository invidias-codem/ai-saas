# ADR-010: Distinguish Deploy Truth from Runtime Truth

## Status
Accepted

## Context
The repository has repeatedly shown that deployment workflow state and live application behavior are related but not identical truth surfaces. Green deploy logs can coexist with runtime problems, and noisy or failed deploy actions do not always mean the live runtime is broken.

## Decision
Treat deploy truth and runtime truth as distinct operational concepts.

Deployment validation should include both:
- workflow/deploy-state checks
- direct live runtime verification of the affected behavior

## Consequences
### Positive
- improves debugging discipline
- reduces overreliance on workflow logs alone
- supports more reliable production verification

### Tradeoffs
- adds verification steps after merge/push
- requires explicit operational habits rather than single-signal confidence
- can make release validation feel more manual unless well-instrumented
