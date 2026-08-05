---
name: eaz-product-catalog
description: 'Forward design (Phase 3, not yet built) for the Marketplace product/category/brand/variant catalog — models, search/filter/pagination, inventory visibility. Use when starting Marketplace catalog work.'
---

# Product Catalog

> **Status: design-only.** This documents the Phase 3 Marketplace domain per `.opencode/DATABASE_DESIGN.md` §4.5 — nothing in `backend/src/modules/` implements this yet (no `product`/`category`/`brand` module exists). Treat this as the plan to build against, not a description of existing code. Check `.opencode/ROADMAP.md` before starting — Marketplace is sequenced after Communities/Channels/Stories (Phase 2).

## Purpose

Standardize how products, categories, brands, variants, and their search/filter/pagination behavior are modeled and served, so the catalog is consistent across the mobile marketplace (and any future web admin).

## Scope

- Product, category, brand, variant, and attribute models
- Catalog querying: search, filters, pagination, sorting
- Inventory visibility and product status

## Architecture Principles

1. **Single catalog model set**: one Product model with nested variants/attributes; avoid separate ad-hoc product shapes per screen.
2. **Denormalize for read, normalize for write**: store searchable/filterable fields (name, category, status, price range) on the product document so list queries are cheap.
3. **Catalog is read-heavy**: optimize for fast reads with indexes and Redis caching; writes are rare and can be heavier.
4. **Status drives visibility**: a product's lifecycle state (`DRAFT`/`ACTIVE`/`ARCHIVED`) is enforced by the service, not by client-side checks.
5. **One canonical slug/permalink**: unique, immutable-ish slug used in URLs and as a human-friendly key.

## Required Patterns

### Models (Mongoose) — full field list in `.opencode/DATABASE_DESIGN.md` §4.5

```text
Product {
  sellerId, sellerProfileId, categoryId, brandId
  name, slug (unique), description
  status DRAFT|ACTIVE|ARCHIVED, currency, basePrice, compareAtPrice?
  attributes      (Map: color, size, material, ...)
  variants        [{ sku, attributes, price?, status }]   # empty when stockSource = SHARED
  stockSource     SHARED | PER_VARIANT
  images          [{ publicId, url, alt, order }]         # see eaz-image-upload
  ratingSummary   { average, count }      (denormalized)
  salesCount      number                  (denormalized, for popularity sort)
  deletedAt, createdAt, updatedAt
}
```

- Category: self-referencing parent for nesting (`parentId`), `slug`, `order`, `status`.
- Brand: `name`, `slug`, `logo`, `status`.
- Attributes: defined per category; products store attribute values; variants reference specific values.

### Product Status

- `DRAFT` → visible only to seller/admin.
- `ACTIVE` → listed in the catalog and purchasable.
- `ARCHIVED` → hidden from the catalog, kept for history.
- Out-of-stock is _derived_ from inventory (see `eaz-inventory`), not a manual status.

### Search, Filters, Pagination, Sorting

- Search: Typesense (decided, self-hosted, public content only — `.opencode/PROJECT_SPEC.md` §20) once wired for this module; the text index in `DATABASE_DESIGN.md` §4.5 is the interim fallback.
- Filters: `category`, `brand`, `attributes`, `priceMin`/`priceMax`, `ratingMin`, `sellerId` — constrain each to indexed fields, see `eaz-api-patterns`.
- Pagination: cursor-based for catalog lists; always sorted deterministically (`sort` + secondary `_id`).
- Sorting: `relevance`, `newest`, `price_asc`, `price_desc`, `rating`, `popular` — whitelist only.
- Always filter `status: ACTIVE` and `deletedAt: null` for public catalog queries by default.

### Inventory Visibility

- Public query responses include only safe stock info (`inStock` boolean, or `availableQty` when configured); never raw warehouse counts.
- Variant-level availability: an `ACTIVE` product with one out-of-stock variant shows that variant as unavailable, not the whole product.
- Reserve/commit quantities only through the inventory service — see `eaz-inventory`; catalog reads derived availability only.

## Best Practices

- Validate every field with Zod at the route; slug is auto-generated from `name` and made unique.
- Index per `.opencode/DATABASE_DESIGN.md` §7: `{sellerId,status}`, `{categoryId,status}`, unique `{slug}`, price/rating/sales sort fields, text index on name/description.
- Return a DTO/shape projection for public endpoints — never the full Mongoose doc.
- Cache hot catalog pages in Redis keyed by `category + filters + page`; invalidate on product write.

## Performance Considerations

- `lean()` + projection on all catalog reads.
- `$match` on status and indexed filters before any `$sort`/`$skip`/`$limit`.
- Cap page size (default 20, max 100).
- Batch price/stock updates with `bulkWrite` when importing catalogs.

## Security Considerations

- Sellers may only create/edit their own products — ownership check in service.
- Admins may manage any product; role checks per `eaz-authentication`.
- Never expose `sellerId`-internal fields or inventory internals in public responses.

## Anti-Patterns to Avoid

- One-off query shapes per screen instead of the canonical catalog query.
- Storing variant data in arrays without a schema (unqueryable).
- Manual "out of stock" status set by users instead of deriving from inventory.
- Returning full documents (with `sellerId`, internal stock) to the public API.

## Common Mistakes

- Non-unique slugs breaking deep links.
- Missing indexes causing full-collection scans on filters.
- Not handling variant-level stock visibility.
- Allowing price/status to change from the client payload.

## Implementation Checklist

1. Confirm this is actually the current priority against `.opencode/ROADMAP.md`/`.opencode/TASKS.md` before starting — Marketplace is Phase 3.
2. Build the catalog module per `eaz-backend-architecture`: models, repository, service, validation, routes.
3. Design indexes and the canonical query (filters + pagination + sort) first, then implement.
4. Add tests for filters, pagination stability, status visibility, and variant availability — see `eaz-testing`.
5. Wire catalog reads to Redis caching and inventory availability, then update `.opencode/TASKS.md`.
