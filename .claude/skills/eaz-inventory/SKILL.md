---
name: eaz-inventory
description: 'Forward design (Phase 3, not yet built) for stock/inventory management — atomic reserve/release/decrement, ledger, concurrency handling. Use when starting Marketplace inventory work.'
---

# Inventory

> **Status: design-only.** This documents the Phase 3 Marketplace domain per `.opencode/DATABASE_DESIGN.md` §4.7–4.8 — no inventory module exists in `backend/src/modules/` yet. Treat this as the plan to build against, not a description of existing code.

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

1. **Inventory is a ledger, not a counter**: every change to stock is an appended transaction; the current level is derived from (or mirrored by) the ledger.
2. **Three distinct quantities**: `onHand` (physical), `reserved` (committed to orders), `available = onHand - reserved` (derived, never stored). Never conflate them.
3. **Atomic mutations**: stock changes are single atomic operations (`$inc`) — never read-modify-write, which corrupts levels under concurrency.
4. **Reserve → decrement lifecycle**: order confirmation _reserves_; shipping _decrements_; cancel/return _releases_. Each is its own transaction type.
5. **One inventory service**: all stock mutations flow through the inventory module; product/catalog code only reads derived availability (see `eaz-product-catalog`).

## Required Patterns

### SKU & Stock Models — full field list in `.opencode/DATABASE_DESIGN.md` §4.7–4.8

```text
StockItem {
  sku (unique per warehouse), productId, variantId?, warehouseId
  onHand   (number, min 0)
  reserved (number, min 0)
  reorderPoint (threshold for low-stock alerts)
  unitCost?    (reporting only — never in public API)
}

InventoryTransaction {   // append-only
  type ADJUST|RESTOCK|RESERVE|RELEASE|DECREMENT|RETURN
  sku, warehouseId, quantity (signed delta), onHandAfter, reservedAfter
  reference (orderId | adjustmentId) — idempotency scope
  actor, note, createdAt
}
```

Guard invariant: `reserved <= onHand`.

### Variant Inventory

- A product with variants has one `StockItem` per variant SKU, not a product-level counter.
- Shared vs per-variant stock is a catalog decision set once (`stockSource` on Product — see `eaz-product-catalog`).

### Warehouses

- `StockItem` is keyed by `(sku, warehouseId)`. A default warehouse exists; multi-warehouse is modeled from day one even if only one is used at MVP.

### Concurrency Handling

- **Never** `find → subtract → save`. Use atomic `updateOne({ sku, warehouseId, available: { $gte: qty } }, { $inc: { reserved: qty } })` — the filter enforces availability and the write is atomic.
- If the atomic update matches 0 documents, availability was insufficient → throw a typed error.
- For multi-line reserves, a failure rolls back prior lines (compensating transactions) so no partial reservation is left dangling.

### Reserve / Release / Decrement

- `reserve(orderId, lines)`: atomically increment `reserved`; filter on `available >= qty`.
- `release(orderId, lines)`: `$inc: { reserved: -qty }` (cancel/return/expiry).
- `decrement(orderId, lines)`: on shipping — `$inc: { onHand: -qty, reserved: -qty }` in one atomic update; guard `onHand >= qty`.
- Every operation appends an `InventoryTransaction` with the order reference.

### Low-Stock Alerts

- After any mutation, check `available <= reorderPoint` and emit a low-stock event to a BullMQ queue.
- Worker aggregates (by warehouse) and notifies sellers/admins; deduplicate so alerts aren't spammed per transaction.

## Best Practices

- All stock mutations are synchronous, transactional, and recorded — no silent manual edits to `onHand`.
- Keep SKU unique and human-readable (`<PRODUCTCODE>-<COLOR>-<SIZE>`).
- Inventory endpoints are admin/seller-only; the public catalog exposes only `inStock`/availability.
- Index `(sku, warehouseId)` unique and `inventoryTransaction.reference`.

## Performance Considerations

- Atomic `$inc` avoids read-modify-write bottlenecks at high order volume.
- Ledger grows fast: index by `(sku, createdAt)` and archive old transactions (`CLAUDE.md` §9 archival strategy).
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
- Direct product-model stock writes from order code.

## Common Mistakes

- Overselling because availability wasn't checked atomically.
- Double-decrementing (decrement on confirm _and_ ship).
- Forgetting to release reservations on cancel/expiry → phantom "unavailable" stock.
- No audit trail for a mysterious stock change.

## Implementation Checklist

1. Confirm this is actually the current priority against `.opencode/ROADMAP.md` before starting — Marketplace is Phase 3.
2. Build the inventory module per `eaz-backend-architecture`: models (StockItem, InventoryTransaction), repository, service (reserve/release/decrement/adjust/restock), validation, routes.
3. Implement atomic mutation helpers and compensating rollback for multi-line operations first.
4. Wire the order lifecycle (`eaz-order-management`) and catalog availability reads to this service.
5. Add tests for concurrency (parallel reserves), overselling, and conservation of stock — see `eaz-testing`.
