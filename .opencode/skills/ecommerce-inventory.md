---
model: anthropic/claude-sonnet-4-6
---

# Skill: Inventory

## Purpose

Standardize stock management across warehouses, SKUs, variants, and orders so stock levels are always accurate under concurrency and auditably traceable.

## Scope

- Stock levels and SKU management
- Reserved (committed) stock
- Low-stock alerts
- Inventory transactions ledger
- Warehouses
- Variant inventory
- Concurrency handling

## Architecture Principles

1. **Inventory is a ledger, not a counter**: every change to stock is an appended transaction; the current level is derived from (or mirrored by) the ledger. This makes reconciliation and debugging possible.
2. **Three distinct quantities**: `onHand` (physical), `reserved` (committed to orders), `available = onHand - reserved`. Never conflate them.
3. **Atomic mutations**: stock changes are single atomic operations (`$inc`) — never read-modify-write, which corrupts levels under concurrency.
4. **Reserve → decrement lifecycle**: order confirmation _reserves_; shipping _decrements_; cancel/return _releases_. Each is its own transaction type.
5. **One inventory service**: all stock mutations flow through the inventory module; product/catalog code only reads derived availability (see `ecommerce-product-catalog.md`).

## Required Patterns

### SKU & Stock Models

```text
StockItem {
  sku           (unique, productId + variantId basis)
  productId, variantId?
  warehouseId
  onHand        (number, min 0)
  reserved      (number, min 0)
  reorderPoint  (threshold for low-stock alerts)
  unitCost?     (for reporting only — never in public API)
  timestamps
}

InventoryTransaction {
  type      (adjust | reserve | release | decrement | restock | return)
  sku, warehouseId
  quantity  (signed delta)
  onHandAfter, reservedAfter
  reference (orderId | adjustmentId)
  actor, note
  at
}
```

### Variant Inventory

- A product with variants has one `StockItem` per variant SKU, not a product-level counter.
- Shared vs per-variant stock is a catalog decision set once (`inventorySource` on Product — see `ecommerce-product-catalog.md`).

### Warehouses

- `StockItem` is keyed by `(sku, warehouseId)`. A default warehouse exists; multi-warehouse is modeled from day one even if only one is used at MVP.
- Availability across warehouses is the sum of available per warehouse, per shipping feasibility.

### Concurrency Handling

- **Never** `find → subtract → save`. Use atomic `updateOne({ sku, warehouseId, available: { $gte: qty } }, { $inc: { reserved: qty } })` — the filter enforces availability and the write is atomic.
- If the atomic update matches 0 documents, availability was insufficient → throw a typed error.
- For multi-line reserves, a failure rolls back prior lines (compensating transactions) so no partial reservation is left dangling.
- Use optimistic locking (`version` field or `$inc` guards) for manual adjustments; detect and reject stale edits.

### Reserve / Release / Decrement

- `reserve(orderId, lines)`: atomically increment `reserved`; filter on `available >= qty`.
- `release(orderId, lines)`: `$inc: { reserved: -qty }` (used on cancel/return/expiry).
- `decrement(orderId, lines)`: on shipping — `$inc: { onHand: -qty, reserved: -qty }` in one atomic update; guard `onHand >= qty`.
- Every operation appends an `InventoryTransaction` with the order reference.

### Low-Stock Alerts

- After any mutation, check `available <= reorderPoint` and emit a low-stock event to a BullMQ queue.
- Worker aggregates (by warehouse) and notifies sellers/admins; deduplicate so alerts aren't spammed per transaction.
- Restock (`restock` transaction) clears the alert when above the threshold.

## Best Practices

- All stock mutations are synchronous, transactional, and recorded — no silent manual edits to `onHand`.
- Keep SKU unique and human-readable (`<PRODUCTCODE>-<COLOR>-<SIZE>`).
- Inventory endpoints are admin/seller-only; the public catalog exposes only `inStock`/availability (see `ecommerce-product-catalog.md`).
- Index `(sku, warehouseId)` unique and `inventoryTransaction.reference`.

## Performance Considerations

- Atomic `$inc` avoids read-modify-write bottlenecks at high order volume.
- Ledger grows fast: index by `(sku, at)` and cap retention via archiving for old transactions.
- Batch bulk adjustments with `bulkWrite`.
- Keep alerts off the hot path (queue, don't send inline).

## Security Considerations

- Only authorized sellers/admins can adjust stock; every adjustment is attributed via `actor`.
- Manual adjustments require a note and are auditable in the ledger.
- Public endpoints never return `onHand`/`reserved`/`unitCost`.

## Anti-Patterns to Avoid

- Read-modify-write stock updates.
- Storing stock as a single integer on the product without a ledger.
- Treating `reserved` as real stock (selling reserved units).
- Blocking order confirmation on slow inventory calls without atomicity.
- Direct product-model `stockQty` writes from order code.

## Common Mistakes

- Overselling because availability wasn't checked atomically.
- Double-decrementing (decrement on confirm _and_ ship).
- Forgetting to release reservations on cancel/expiry → phantom "unavailable" stock.
- No audit trail for a mysterious stock change.

## AI Implementation Instructions

1. Read inventory requirements in `PROJECT_SPEC.md` Phase 3 and the Marketplace Engineer's variant model.
2. Build the inventory module per `ecommerce-backend-architecture.md`: models (StockItem, InventoryTransaction), repository, service (reserve/release/decrement/adjust/restock), validation, routes.
3. Implement atomic mutation helpers and compensating rollback for multi-line operations first.
4. Wire the order lifecycle (`ecommerce-order-management.md`) and catalog availability reads to this service.
5. Add tests for concurrency (parallel reserves), overselling, and conservation of stock — see `ecommerce-testing.md`.
6. Update `TASKS.md`; do not mark complete until review.
