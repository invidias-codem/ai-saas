# Parked contracts

Unimplemented-feature contract stubs that must not run red in CI. Each file
documents why it's parked and what ships it.

| File | Why parked | Ships when |
|---|---|---|
| `memory-operation-key.contract.test.ts` | `storeMemory` has no `operationKey` support (no `MemoryWriteOptions` field, no `operation_key` column/constraint, no call sites). Contract-first stub from the code-builder WIP workstream (2026-10-12). | The memory-idempotency feature slice lands: add `operation_key` to `workspace_memories` (unique, nullable), thread `MemoryWriteOptions.operationKey` through `storeMemory`, return extant id on 23505 replay, then move this file to `__tests__/contracts/` and remove the `research/parked-contracts` tsconfig exclusion entry. |

Found during VDI housekeeping reconciliation — see `lib/vdi/RELEASE_ACTIVATION.md`.
