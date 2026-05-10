# ADR-007: General Mode for Pre-Workspace Chat

## Status
Accepted

## Context
Earlier UI patterns risked exposing multiple apparent chat modes even when the backend did not yet have enough workspace/profile context to justify materially different runtime behavior. This created a risk of misleading precision in the user interface.

## Decision
Use a simplified and more honest **General** mode for pre-workspace or lightly-scoped chat flows until richer workspace/profile context exists to support more differentiated backend routing.

## Consequences
### Positive
- more truthful UX
- reduces mismatch between UI claims and backend reality
- supports a cleaner transition into workspace/profile-aware runtime behavior

### Tradeoffs
- less apparent user control in early/scopeless chat flows
- requires users to move into workspace-backed flows for richer behavior shaping
- may feel simpler than some users initially expect
