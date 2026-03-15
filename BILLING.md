# Billing Policy & Charging Points

This document outlines the charging strategy for the AI SaaS platform to ensure correct billing, prevent race conditions, and handle failures gracefully.

## Guiding Principles

1.  **Atomic Operations**: All credit deductions occur within a single database transaction using the `spend_credits` RPC. This prevents race conditions and ensures consistency.
2.  **Idempotency**: All API requests involving credit spend support an `Idempotency-Key` header. Retrying the same request (e.g., due to network timeout) will not result in double-charging.
3.  **Upfront Charging**: For expensive operations (Image, Music, Video, Code), credits are deducted *before* the operation begins.
4.  **Automatic Refunds**: If a generative task fails after credits are deducted, the system automatically issues a refund.

## Charging Points by Feature

### 1. Conversation (Text Chat)
-   **Cost**: `1` credit per turn (user message).
-   **Timing**: Charged atomically at the start of the request.
-   **Refund Policy**: If the LLM generation fails or throws an error, the credit is refunded.

### 2. Code Generation
-   **Cost**: `5` credits per request.
-   **Timing**: Charged atomically at the start of the request.
-   **Refund Policy**: If the code generation fails or throws an error, the credits are refunded.

### 3. Image Generation
-   **Cost**: `3` credits per image.
-   **Timing**: Charged atomically at the start of the request (Total = `amount * 3`).
-   **Refund Policy**: If image generation fails, the full cost is refunded.

### 4. Music Generation (Replicate)
-   **Cost**: `10` credits per request.
-   **Timing**: Charged atomically *on submission* to Replicate.
-   **Refund Policy**: If the initial submission to Replicate fails, the credits are refunded immediately. (Note: If the async job fails *after* submission, a separate refund mechanism would be needed, currently manual review).

### 5. Video Generation (Replicate)
-   **Cost**: `25` credits per request.
-   **Timing**: Charged atomically *on submission* to Replicate.
-   **Refund Policy**: If the initial submission to Replicate fails, the credits are refunded immediately.

## Technical Implementation

### Database Schema
-   **`supporter_credits`**: Stores current user balance.
-   **`credit_transactions`**: Ledger of all credit movements (spending, purchasing, refunds).
    -   Includes `idempotency_key` to prevent duplicate transactions.

### Key Functions
-   **`spend_credits` (RPC)**:
    -   Checks idempotency.
    -   Locks user row.
    -   Verifies balance.
    -   Deducts credits.
    -   Logs transaction.
    -   Returns JSON result (success/failure/duplicate).

-   **`process_kofi_donation` (RPC)**:
    -   Handles incoming webhook donations idempotently.
    -   credits user account based on `transaction_id`.

## Retry Behavior
Clients should generate a unique `Idempotency-Key` (UUID) for each distinct operation. If a request fails due to a network error (e.g., 504 Timeout), the client can safely retry with the **same** key. The server will recognize the duplicate request and return the cached success response without charging again.
