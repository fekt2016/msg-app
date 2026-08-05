---
name: eaz-order-management
description: 'Forward design (Phase 3, not yet built) for the order lifecycle — cart, checkout, state machine, shipping, cancellation, returns. Use when starting Marketplace order work.'
---

# Order Management

> **Status: design-only.** This documents the Phase 3 Marketplace domain per `.opencode/DATABASE_DESIGN.md` §4.10–4.12 — no order/cart module exists in `backend/src/modules/` yet. Treat this as the plan to build against, not a description of existing code.

## Purpose

Standardize the order lifecycle — from cart and checkout through shipping, delivery, cancellation, and returns — so order behavior is identical across marketplace, seller tools, and any admin surface.

## Scope

- Cart
- Checkout
- Order lifecycle (state machine)
- Shipping status and delivery workflow
- Cancellation and returns
- Notifications and inventory updates

## Architecture Principles

1. **Orders are an explicit state machine**: every transition is whitelisted, validated, and recorded. No arbitrary status edits.
2. **The order is the source of truth**: line items, totals, and addresses are snapshotted at purchase time — later product price changes never alter a confirmed order.
3. **Money + stock change atomically**: confirmation reserves inventory and captures payment as one unit of work (see `eaz-inventory` and `eaz-paystack`).
4. **All transitions are auditable**: every status change is logged with actor, reason, and timestamp.
5. **Buyer and seller never mutate the same state blindly**: role-scoped transitions only (seller marks shipped; buyer requests cancellation; admin mediates).

## Required Patterns

### Cart

- Server-side cart keyed by user, stored in MongoDB; Redis only as cache.
- Cart items hold `productId`, `variantId?`, `quantity`, and a **price snapshot** at add-time; totals recomputed server-side on fetch.
- Validate availability and price against current catalog before checkout.
- Cart is not an order: no reservations are made while items sit in the cart.

### Order Model — full field list in `.opencode/DATABASE_DESIGN.md` §4.11

```text
Order {
  orderNumber (unique, e.g. EAZ-12345), userId (buyer)
  lines       [{ productId, variantId?, sku, name, attributes (snapshot), unitPrice, quantity, lineTotal }]
  currency, totals { subtotal, shippingFee, tax, total }
  shipping    { address, method, carrier?, trackingNo?, fee }
  payment     { reference, gateway, status }
  status      (state machine below)
}
```

### Order Lifecycle (state machine)

```
PENDING (created, awaiting payment)
  → CONFIRMED (payment captured, inventory reserved)      [auto via webhook]
  → PROCESSING (seller preparing)                          [seller]
  → SHIPPED (trackingNo set)                               [seller]
  → DELIVERED (buyer confirms)                             [buyer]
  → COMPLETED (archive/rate flow)                          [system]

From PENDING/CONFIRMED/PROCESSING: → CANCELLED             [buyer or admin]
From SHIPPED: → RETURN_REQUESTED → RETURNED / REFUNDED     [buyer → admin]
```

- Every transition requires a valid `from` state; unknown transitions return `409`.
- Transitions persist an `OrderEvent { from, to, by, role, reason, at }` record (append-only, `.opencode/DATABASE_DESIGN.md` §4.12).
- `CONFIRMED` is reached **only** by the payment service after `charge.success` — never manually.

### Checkout

1. Validate cart, addresses, and item availability.
2. Create the order in `PENDING`.
3. Initialize payment (see `eaz-paystack`), attach `payment.reference`.
4. On webhook success → order service transitions `PENDING → CONFIRMED` and atomically reserves inventory.
5. Failure/expiry → order can be retried or cancelled; no inventory was reserved.

### Shipping & Delivery

- Seller sets `shipping.method`, then `status: SHIPPED` with `carrier` + `trackingNo`.
- Buyer confirms delivery → `DELIVERED`; auto-confirm after a configured TTL (e.g., 7 days) if no dispute.
- Delivery updates trigger notifications to buyer (shipped/tracked/delivered).

### Cancellation

- Cancellable only from `PENDING | CONFIRMED | PROCESSING`; blocked after shipping.
- On cancel: release reserved inventory atomically; if already paid, trigger refund via `eaz-paystack` and transition payment state.
- Record reason; allow admin override with audit trail.

### Returns

- Buyer requests return from `SHIPPED`/`DELIVERED` with reason + optionally photos.
- Admin approves/rejects → `RETURNED`; on approval, refund (full or partial) and reverse inventory.

### Notifications & Inventory Updates

- Notify on every state transition the user cares about, via the notification module (FCM/email) through BullMQ — never block the request.
- Reserve on `CONFIRMED`, release on `CANCELLED`/`RETURNED`, decrement on `SHIPPED` — all through `eaz-inventory`, never direct model writes.

## Best Practices

- Totals are computed server-side from server-stored snapshots; never trust client totals.
- `orderNumber` is unique and indexed; use it in all customer communications.
- Idempotent transition endpoints: retrying the same transition returns the current state, not an error.
- Race safety: `findOneAndUpdate` with the expected `from` state in the filter so two concurrent transitions can't double-apply.

## Performance Considerations

- Paginate order lists for buyer, seller, and admin.
- Keep the state transition atomic and small; run notifications async.
- Avoid loading full item documents for list views — project `items` to minimal fields.

## Security Considerations

- Buyers read only their own orders; sellers read only orders containing their items; admins read all — RBAC + ownership checks in the service.
- Audit every manual/admin status override.

## Anti-Patterns to Avoid

- Allowing arbitrary status writes (no state machine).
- Recomputing prices from the live catalog at fulfillment time.
- Reserving inventory at cart-add time.
- Blocking the request on notifications/emails.

## Common Mistakes

- Double-`CONFIRMED` on webhook retry (missing idempotency — see `eaz-paystack`).
- Leaking stock when cancelling but forgetting to reserve on confirm.
- No audit trail for admin overrides.
- Race conditions from read-modify-write on status.

## Implementation Checklist

1. Confirm this is actually the current priority against `.opencode/ROADMAP.md` before starting — Marketplace is Phase 3.
2. Build the order module per `eaz-backend-architecture`: model, state machine definition, repository, service, validation, routes.
3. Define the transition map and the atomic `findOneAndUpdate` guards before implementing handlers.
4. Wire checkout to the payment service and inventory service.
5. Add tests for the full lifecycle, invalid transitions, idempotency, and inventory conservation — see `eaz-testing`.
