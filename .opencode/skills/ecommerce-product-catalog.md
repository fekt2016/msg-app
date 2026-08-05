---
model: anthropic/claude-sonnet-4-6
---

# Skill: Product Catalog

## Purpose

Standardize how products, categories, brands, variants, and their search/filter/pagination behavior are modeled and served, so the catalog is consistent across the mobile marketplace and web admin.

## Scope

- Product, category, brand, variant, and attribute models
- Catalog querying: search, filters, pagination, sorting
- Inventory visibility and product status

## Architecture Principles

1. **Single catalog model set**: one Product model with nested variants/attributes; avoid separate ad-hoc product shapes per screen.
2. **Denormalize for read, normalize for write**: store searchable/filterable fields (name, category, status, price range) on the product document so list queries are cheap.
3. **Catalog is read-heavy**: optimize for fast reads with indexes and Redis caching; writes are rare and can be heavier.
4. **Status drives visibility**: a product's lifecycle state (draft, active, archived, out-of-stock) is enforced by the service, not by client-side checks.
5. **One canonical slug/permalink**: unique, immutable-ish slug used in URLs and as a human-friendly key.

## Required Patterns

### Models (Mongoose)

```text
Product {
  sellerId        (ref User)
  categoryId      (ref Category)
  brandId         (ref Brand, optional)
  name, slug (unique), description
  price, currency, compareAtPrice?
  attributes      (Map / subdocs: color, size, material)
  variants        [{ sku, attributes, price?, stockQty, status }]
  images          [{ url, alt }]          # see ecommerce-image-upload.md
  status          (draft | active | archived)
  inventorySource (shared | perVariant)
  ratingSummary   { average, count }      # denormalized
  timestamps, indexes
}
```

- Category: self-referencing parent for nesting (`parentId`), `slug`, `order`, `active`.
- Brand: `name`, `slug`, `logo`, `active`.
- Attributes: defined per category (e.g., category "Shoes" defines size/color); products store attribute values; variants reference specific values.

### Product Status

- `draft` → visible only to seller/admin.
- `active` → listed in the catalog and purchasable.
- `archived` → hidden from the catalog, kept for history.
- Out-of-stock is a _derived_ state from inventory (see `ecommerce-inventory.md`), not a manual status — unless a product has no variants, then `stockQty` drives it.

### Search, Filters, Pagination, Sorting

- Search: text match on `name`, `description`, `brand.name`, `category.name`. Use the project's search engine decision (Atlas Search / Meilisearch / Typesense — `PROJECT_SPEC.md` §6) for scale; fall back to indexed regex/trie only for MVP.
- Filters: `category`, `brand`, `attributes` (color/size/value), `priceMin`/`priceMax`, `ratingMin`, `sellerId`. Constrain each filter to indexed fields — see `ecommerce-api-patterns.md`.
- Pagination: cursor-based for catalog lists; always sorted deterministically (`sort` + secondary `_id`) — see `ecommerce-api-patterns.md`.
- Sorting: `relevance`, `newest`, `price_asc`, `price_desc`, `rating`, `popular` (by sales/views). Only allow a whitelist of sort keys.
- Always filter `status: 'active'` for public catalog queries by default.

### Inventory Visibility

- Public query responses include only safe stock info: `inStock` (boolean) or `availableQty` when configured; never raw warehouse counts.
- Variant-level availability: an `active` product with a variant out of stock shows the variant as unavailable, not the whole product.
- Reserve/commit quantities only through inventory service calls — see `ecommerce-inventory.md`; catalog reads derived availability.

## Best Practices

- Validate every field with Zod at the route; slug is auto-generated from `name` and made unique.
- Index: `{ sellerId, status }`, `{ categoryId, status }`, `{ slug }` unique, `{ price }`, `{ ratingSummary.average }`, text index on name/description.
- Return a DTO/shape projection for public endpoints — never the full Mongoose doc.
- Cache hot catalog pages in Redis keyed by `category + filters + page`; invalidate on product write.
- Keep product images optimized and CDN-served — see `ecommerce-image-upload.md`.

## Performance Considerations

- Use `lean()` + projection on all catalog reads.
- `$match` on status and indexed filters before any `$sort`/`$skip`/`$limit`.
- Cap page size (default 20, max 100) — see `ENGINEERING_RULES.md` §3.
- Avoid `$regex` prefix-less patterns on large collections.
- Batch price/stock updates with `bulkWrite` when importing catalogs.

## Security Considerations

- Sellers may only create/edit their own products — ownership check in service.
- Admins may manage any product; role checks per `ecommerce-authentication.md`.
- Never expose `sellerId`-internal fields or inventory internals in public responses.
- Sanitize free-text search input.

## Anti-Patterns to Avoid

- One-off query shapes per screen instead of the canonical catalog query.
- Storing variant data in arrays without a schema (unqueryable).
- Manual `out of stock` status set by users instead of deriving from inventory.
- Unbounded text search over a growing collection.
- Returning full documents (with `sellerId`, internal stock) to the public API.

## Common Mistakes

- Non-unique slugs breaking deep links.
- Missing indexes causing full-collection scans on filters.
- Sorting by unindexed fields and killing performance.
- Not handling variant-level stock visibility.
- Allowing price/status to change from the client payload.

## AI Implementation Instructions

1. Read catalog requirements in `PROJECT_SPEC.md` Phase 3 (Marketplace) and confirm the search-engine decision with the Project Architect.
2. Build the catalog module per `ecommerce-backend-architecture.md`: models, repository, service (create, update, query, status transitions), validation, routes.
3. Design indexes and the canonical query (filters + pagination + sort) first, then implement.
4. Add tests for filters, pagination stability, status visibility, and variant availability — see `ecommerce-testing.md`.
5. Wire catalog reads to Redis caching and inventory availability, then update `TASKS.md`.
