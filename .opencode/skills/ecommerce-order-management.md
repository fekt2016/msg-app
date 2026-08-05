---
model: anthropic/claude-sonnet-4-6
---

# Skill: Order Management

## Purpose

Standardize the order lifecycle — from cart and checkout through shipping, delivery, cancellation, and returns — so order behavior is identical in the marketplace, seller tools, and admin dashboard.

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
3. **Money + stock change atomically**: confirmation reserves inventory and captures payment as one unit of work (see `ecommerce-inventory.md` and `ecommerce-paystack.md`).
4. **All transitions are auditable**: every status change is logged with actor, reason, and timestamp (see `ecommerce-admin-dashboard.md` activity logs).
5. **Buyer and seller never mutate the same state blindly**: role-scoped transitions only (seller marks shipped; buyer requests cancellation; admin mediates).

## Required Patterns

### Cart

- Server-side cart keyed by user (or guest cart merged on login), stored in MongoDB; Redis only as cache.
- Cart items hold `productId`, `variantId?`, `quantity`, and a **price snapshot** at add-time; totals recomputed server-side on fetch.
- Validate availability and price against current catalog before checkout.
- Cart is not an order: no reservations are made while items sit in the cart.

### Order Model

```text
Order {
  orderNumber    (unique, human-friendly, e.g., EAZ-12345)
  userId         (buyer)
  items          [{ productId, variantId?, sku, name, unitPrice, qty, snapshot }]
  currency, subtotal, shippingFee, tax, total
  shipping       { address, method, carrier?, trackingNo?, fee }
  payment        { reference, gateway, status }
  status         (state machine below)
  timestamps, indexes
}
```

### Order Lifecycle (state machine)

```
pending (created, awaiting payment)
  → confirmed (payment captured, inventory reserved)      [auto via webhook]
  → processing (seller preparing)                          [seller]
  → shipped (trackingNo set)                               [seller]
  → delivered (buyer confirms)                             [buyer]
  → completed (archive/rate flow)                          [system]

From pending/confirmed/processing: → cancelled             [buyer or admin]
From shipped: → return_requested → returned / refunded     [buyer → admin]
```

- Every transition requires a valid `from` state; unknown transitions return `409`.
- Transitions persist an `OrderEvent { from, to, by, role, reason, at }` record.
- `confirmed` is reached **only** by the payment service after `charge.success` — never manually.

### Checkout

1. Validate cart, addresses, and item availability.
2. Create the order in `pending`.
3. Initialize payment (see `ecommerce-paystack.md`), attach `payment.reference`.
4. On webhook success → order service transitions `pending → confirmed` and atomically reserves inventory.
5. Failure/expiry → order can be retried or cancelled; no inventory was reserved.

### Shipping & Delivery

- Seller sets `shipping.method`, then `status: shipped` with `carrier` + `trackingNo`.
- Buyer confirms delivery → `delivered`; auto-confirm after a configured TTL (e.g., 7 days) if no dispute.
- Delivery updates trigger notifications to buyer (shipped/tracked/delivered).

### Cancellation

- Cancellable only from `pending | confirmed | processing`; blocked after shipping.
- On cancel: release reserved inventory atomically; if already paid, trigger refund via `ecommerce-paystack.md` refund flow and transition payment state.
- Record reason; allow admin override with audit trail.

### Returns

- Buyer requests return from `shipped`/`delivered` with reason + optionally photos.
- Admin approves/rejects → `returned`; on approval, refund (full or partial) and reverse inventory.
- Return shipping and restocking are configured business rules, not inline constants.

### Notifications

- Notify on every state transition the user cares about: order confirmed, shipped, delivered, cancelled, refunded.
- Use the notification module (FCM/email) via BullMQ — never block the request (see `ecommerce-backend-architecture.md`).

### Inventory Updates

- Reserve on `confirmed`, release on `cancelled`/`returned`, decrement on `shipped`.
- All stock changes go through `ecommerce-inventory.md` transactions — never direct model writes.

## Best Practices

- Totals are computed server-side from server-stored snapshots; never trust client totals.
- `orderNumber` is unique and indexed; use it in all customer communications.
- Idempotent transition endpoints: retrying the same transition returns the current state, not an error.
- Race safety: use Mongoose `findOneAndUpdate` with the expected `from` state in the filter so two concurrent transitions can't double-apply.
- Index `{ userId, createdAt }`, `{ status }`, `{ orderNumber }` unique.

## Performance Considerations

- Paginate order lists for buyer, seller, and admin — see `ecommerce-api-patterns.md`.
- Keep the state transition atomic and small; run notifications async.
- Avoid loading full item documents for list views — project `items` to minimal fields.

## Security Considerations

- Buyers read only their own orders; sellers read only orders containing their items; admins read all — RBAC + ownership checks in the service.
- Never expose `payment.reference` internals beyond what's needed.
- Audit every manual/admin status override.

## Anti-Patterns to Avoid

- Allowing arbitrary status writes (no state machine).
- Recomputing prices from the live catalog at fulfillment time.
- Reserving inventory at cart-add time.
- Blocking the request on notifications/emails.
- Letting buyers or sellers force transitions they're not allowed to make.

## Common Mistakes

- Double-`confirmed` on webhook retry (missing idempotency — see `ecommerce-paystack.md`).
- Leaking stock when cancelling but forgetting to reserve on confirm.
- No audit trail for admin overrides.
- Race conditions from read-modify-write on status.

## AI Implementation Instructions

1. Read order requirements in `PROJECT_SPEC.md` Phase 3 and coordinate with the Marketplace Engineer on cart/checkout UX.
2. Build the order module per `ecommerce-backend-architecture.md`: model, state machine definition, repository, service (transitions, checkout, cancel, return), validation, routes.
3. Define the transition map and the atomic `findOneAndUpdate` guards before implementing handlers.
4. Wire checkout to the payment service and inventory service; ensure transactions.
5. Add tests for the full lifecycle, invalid transitions, idempotency, and inventory conservation — see `ecommerce-testing.md`.
6. Update `TASKS.md`; do not mark complete until review.
