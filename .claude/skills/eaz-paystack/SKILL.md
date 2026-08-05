---
name: eaz-paystack
description: 'Forward design (Phase 3, not yet built) for Paystack payment integration — initialization, webhook verification, idempotent fulfillment, refunds. Use when starting Marketplace payments work.'
---

# Paystack Payments

> **Status: design-only.** This documents the Phase 3 Marketplace domain per `.opencode/DATABASE_DESIGN.md` §4.13–4.14 — no payment module exists in `backend/src/modules/` yet. Treat this as the plan to build against, not a description of existing code. Gateway decision (Paystack + MoMo/Hubtel) is confirmed in `.opencode/PROJECT_SPEC.md` §6.

## Purpose

Standardize how payments are initialized, verified, and confirmed using Paystack so every payment flow (checkout, marketplace purchase) behaves identically and safely.

## Scope

- Payment initialization (Paystack Checkout)
- Payment verification (callback / verify endpoint)
- Webhooks (authorization, idempotency, fulfillment)
- Refunds
- Order confirmation and retry strategy

## Architecture Principles

1. **Server-side secrets only**: `PAYSTACK_SECRET_KEY` lives in backend env. Never expose it to any client.
2. **Trust the webhook, not the callback**: the client redirect callback is UX only; business fulfillment happens on the verified webhook.
3. **Idempotency by reference**: every charge references a unique server-generated reference; never trust amount/status from the client.
4. **One source of truth**: order/payment state lives in the database and is updated only by the payment service.
5. **Payments are a service**: payment logic lives in the payment module service, called by checkout/order services — never inline in controllers.

## Required Patterns

### Flow Overview

```
Checkout → create payment record (status: PENDING) → initialize with Paystack
→ client redirects to Paystack Checkout → Paystack redirects back
→ client shows "confirming" → webhook(event: charge.success) → verify
→ mark payment SUCCESS → fulfill order → notify buyer/seller
```

### Payment Initialization

- Endpoint: `POST /api/v1/payments/initialize`.
- Payload: `{ reference, amount, currency, email, callbackUrl, metadata: { orderId } }`.
- `reference` is generated server-side (unique, e.g., `EAC-<uuid>`); the same order cannot initialize a new payment while one is pending.
- Store a Payment record with `status: PENDING`, `reference`, `amount`, `currency`, `metadata` (`.opencode/DATABASE_DESIGN.md` §4.13).
- Return `authorization_url` to the client for redirect.

### Payment Verification

- `GET /api/v1/payments/verify?reference=<ref>` (or verify inside the webhook flow).
- Compare server-stored amount/currency against the verified Paystack response; mismatch → mark `FAILED` and log (do not fulfill).
- Only `status === 'success'` transitions a payment to `SUCCESS`.

### Webhooks

- Paystack posts events to `POST /api/v1/payments/webhook`.
- **Verify the signature**: hash the raw body with `PAYSTACK_WEBHOOK_SECRET` and compare to the `x-paystack-signature` header; reject mismatches with `400` before parsing business logic.
- Handle at minimum: `charge.success`, `refund.processed`.
- **Idempotency**: process by `reference`/event id; if the payment is already in the target state, return `200` without re-fulfilling.
- The webhook must return `200` fast (queue the fulfillment via BullMQ, see `eaz-backend-architecture`).
- Never trust body data alone: re-verify the reference with Paystack before fulfilling.

### Order Confirmation

- Fulfillment is transactional: mark payment `SUCCESS`, move order to `CONFIRMED` (see `eaz-order-management`), and reserve/decrement inventory atomically (see `eaz-inventory`).
- On any partial failure, compensate: roll back order state and flag for retry — never leave a paid order unfulfilled silently.

### Refunds

- Only refund through Paystack's refund API with the `transactionId`, never by editing records.
- Record refunds as their own ledger entry (`.opencode/DATABASE_DESIGN.md` §4.14) with reason and amount; update the Payment record.
- Partial refunds supported; cap at paid amount.

### Retry Strategy

- Failed initialization: client can retry with the same order; new `reference`.
- Expired/unverified pending payments: expire after TTL (e.g., 24h) and allow re-init.
- Webhook processing failures: BullMQ retries with backoff; poison messages land in an error queue for manual review.
- Never auto-retry a `charge.success` fulfillment without idempotency — double fulfillment is the worst failure mode.

## Best Practices

- Env: `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY`, `PAYSTACK_WEBHOOK_SECRET`.
- Store `currency` and `amount` in minor units consistently (`CLAUDE.md` §9) and validate at the Zod layer.
- Keep a payments ledger separate from orders so refunds/partials are traceable.
- Log every payment transition (initialized, verified, paid, refunded) with reference and timestamps — never the card/payment data itself.

## Performance Considerations

- Queue webhook fulfillment; never do heavy work synchronously in the webhook handler.
- Index Payment records by `reference` and by `orderId`.
- Idempotency checks must be fast (indexed lookup) since Paystack retries webhooks frequently.

## Security Considerations

- Secret key is server-only; public key is safe for clients.
- Verify webhook signatures with constant-time comparison.
- Validate amount server-side against the order — a tampered callback can't change what's charged.
- Sanitize and type all webhook payloads before touching the DB.

## Anti-Patterns to Avoid

- Fulfilling orders from the client redirect callback.
- Trusting `amount`/`status` from the client or from the webhook body without server verification.
- Storing `PAYSTACK_SECRET_KEY` in the mobile client.
- Non-idempotent fulfillment (double-shipping on webhook retry).
- Allowing multiple concurrent pending payments for the same order.

## Common Mistakes

- Not verifying webhook signatures and accepting forged success events.
- Generating `reference` client-side.
- Comparing the wrong currency/amount units.
- Forgetting to expire pending payments.
- Updating order state before payment is confirmed.

## Implementation Checklist

1. Confirm this is actually the current priority against `.opencode/ROADMAP.md` before starting — Marketplace/Payments is Phase 3.
2. Build the payment module per `eaz-backend-architecture`: model, repository, service (initialize, verify, webhook, refund), controllers, routes.
3. Implement signature verification and idempotency first — before any fulfillment logic.
4. Wire fulfillment to order + inventory services; queue it in BullMQ.
5. Add tests covering webhook signature, idempotent retries, amount mismatch, and refund paths — see `eaz-testing`. Security-review before marking complete.
