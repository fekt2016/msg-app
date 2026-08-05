---
model: anthropic/claude-sonnet-4-6
---

# Skill: Paystack Payments

## Purpose

Standardize how payments are initialized, verified, and confirmed using Paystack so every payment flow (checkout, top-up, marketplace purchase) behaves identically and safely.

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
Checkout → create payment record (status: pending) → initialize with Paystack
→ client redirects to Paystack Checkout → Paystack redirects back
→ client shows "confirming" → webhook(event: charge.success) → verify
→ mark payment paid → fulfill order → notify buyer/seller
```

### Payment Initialization

- Endpoint: `POST /api/v1/payments/initialize`.
- Payload: `{ reference, amount, currency, email, callbackUrl, metadata: { orderId } }`.
- `reference` is generated server-side (unique, e.g., `EAC-<uuid>`); the same order cannot initialize a new payment while one is pending.
- Store a Payment record with `status: pending`, `reference`, `amount`, `currency`, `metadata`.
- Paystack's standard library / HTTP client calls `POST https://api.paystack.co/transaction/initialize` with `Authorization: Bearer <secret>`.
- Return `authorization_url` to the client for redirect.

### Payment Verification

- `GET /api/v1/payments/verify?reference=<ref>` (or verify inside the webhook flow).
- Call Paystack `GET /api/paystack.co/transaction/verify/:reference`.
- Compare server-stored amount/currency against the verified response; mismatch → mark `failed` and log (do not fulfill).
- Only `status === 'success'` transitions a payment to `paid`.

### Webhooks

- Paystack posts events to `POST /api/v1/payments/webhook`.
- **Verify the signature**: hash the raw body with `PAYSTACK_WEBHOOK_SECRET` and compare to the `x-paystack-signature` header; reject mismatches with `400` before parsing business logic.
- Handle at minimum: `charge.success`, `transfer.success/failed` (if payouts), `refund.processed`.
- **Idempotency**: process by `reference`/event id; if the payment is already in the target state, return `200` without re-fulfilling.
- The webhook must return `200` fast (queue the fulfillment) — use BullMQ, see `ecommerce-backend-architecture.md`.
- Never trust body data alone: re-verify the reference with Paystack before fulfilling.

### Order Confirmation

- Fulfillment is transactional: mark payment `paid`, move order to `confirmed`/`paid` state, and reserve/decrement inventory atomically (see `ecommerce-inventory.md`).
- On any partial failure, compensate: roll back order state and flag for retry, never leave a paid order unfulfilled silently.
- Notify buyer and seller (email/push) after fulfillment commits.

### Refunds

- Only refund through Paystack's refund API with the `transactionId`, never by editing records.
- Record refunds as their own ledger entry with reason and amount; update the Payment record.
- Partial refunds supported; cap at paid amount.
- Webhook `refund.processed` updates the record; orders follow their own returns/cancellation flow (see `ecommerce-order-management.md`).

### Retry Strategy

- Failed initialization: client can retry with the same order; new `reference`.
- Expired/unverified pending payments: expire after TTL (e.g., 24h) and allow re-init.
- Webhook processing failures: BullMQ retries with backoff; poison messages land in an error queue for manual review.
- Never auto-retry a `charge.success` fulfillment without idempotency — double fulfillment is the worst failure mode.

## Best Practices

- Env: `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY`, `PAYSTACK_WEBHOOK_SECRET` (see `.env.example`).
- Store `currency` and `amount` in minor units consistently and validate at Zod layer.
- Keep a payments ledger separate from orders so refunds/partials are traceable.
- Log every payment transition (initialized, verified, paid, refunded) with reference and timestamps.

## Performance Considerations

- Queue webhook fulfillment; never do heavy work synchronously in the webhook handler.
- Index Payment records by `reference` and by `orderId`.
- Idempotency checks must be fast (indexed lookup) since Paystack retries webhooks frequently.

## Security Considerations

- Secret key is server-only; public key is safe for clients.
- Verify webhook signatures with constant-time comparison.
- Validate amount server-side against the order — a tampered callback can't change what's charged.
- Sanitize and type all webhook payloads before touching the DB.
- Review with the Security Engineer per `AGENTS.md`.

## Anti-Patterns to Avoid

- Fulfilling orders from the client redirect callback.
- Trusting `amount`/`status` from the client or from webhook body without server verification.
- Storing `PAYSTACK_SECRET_KEY` in the mobile/web client.
- Non-idempotent fulfillment (double-shipping on webhook retry).
- Allowing multiple concurrent pending payments for the same order.
- Direct DB writes from the webhook handler without going through the payment service.

## Common Mistakes

- Not verifying webhook signatures and accepting forged success events.
- Generating `reference` client-side.
- Comparing the wrong currency/amount units.
- Forgetting to expire pending payments.
- Updating order state before payment is confirmed.

## AI Implementation Instructions

1. Read the Payments requirements in `PROJECT_SPEC.md` and confirm the gateway decision (Paystack + MoMo/Hubtel per Phase 3) with the Marketplace Engineer.
2. Build the payment module per `ecommerce-backend-architecture.md`: model, repository, service (initialize, verify, webhook, refund), controllers, routes.
3. Implement signature verification and idempotency first — before any fulfillment logic.
4. Wire fulfillment to order + inventory services transactionally; queue it in BullMQ.
5. Add tests covering webhook signature, idempotent retries, amount mismatch, and refund paths — see `ecommerce-testing.md`.
6. Update `TASKS.md`; do not mark complete until security review is done.
