# Database Design — Eaz Community (Marketplace & E-Commerce)

**Owner:** Database Architect (per `AGENTS.md`)
**Status:** Draft — pending review sign-off
**Applies to:** Marketplace, Orders, Payments, Inventory modules (Phase 3)
**Integrates with:** Authentication/Users, Notifications, Administration
**Source of truth:** `PROJECT_SPEC.md` (requirements), `ENGINEERING_RULES.md` §4 (database rules)

> This document defines **what** to store and **how** it is structured. Implementation
> patterns (service/repository layers, atomic updates) are covered by the skills in
> `.opencode/skills/`. Out of scope: messaging/chat, communities, stories, and calls —
> those modules reference `users` only and are designed separately.

---

## 1. Design Principles

1. **Documents model aggregates, not tables.** Embed what is read together and owned by
   the parent (cart items, order lines, product variants/images). Reference what is shared
   or queried independently (users, categories, brands, products).
2. **Reads are shaped, writes are atomic.** Denormalize for the read paths; keep every
   write a single-document atomic operation. Never read-modify-write stock or money.
3. **Business invariants live in the data model.** States are enums with whitelisted
   transitions; append-only ledgers (inventory, events) make history auditable.
4. **Money is exact.** Store amounts as integer minor units (Ghana pesewas, `NumberLong`)
   with an explicit `currency`. No floats. Use `Decimal128` only where division is required
   server-side.
5. **Everything is traceable.** Every order/payment/stock mutation records actor, reference,
   and timestamps. Idempotency keys protect retried webhooks.
6. **Soft-delete is the default — DECIDED** (see §11), with append-only exceptions for
   ledgers, events, and activity logs.
7. **No duplicated source data.** Denormalization is limited to stable, derived snapshots
   (order line price, product denormalized name/status) and is kept in sync by the owning
   service — not ad-hoc copies.

---

## 2. Global Conventions

### Naming

- Collections: plural `snake_case` (`inventory_stock_items`).
- Fields: `camelCase`. Enum values: `UPPER_SNAKE_CASE`.
- MongoDB indexes: `{ field: 1 }`, unique indexes on natural keys (`email`, `slug`,
  `orderNumber`, `reference`, `sku`).
- Business keys are human-facing and unique-indexed; `_id` (ObjectId) is internal.

### Every Collection Must Have

- `createdAt` / `updatedAt` timestamps (Mongoose `timestamps: true`).
- Validation at the Mongoose schema level **and** at the API edge (Zod) — see
  `ecommerce-api-patterns.md`.
- Indexes that serve the documented query paths (§7).
- Pagination support for any list surface (default 20, max 100 — `PROJECT_SPEC.md` §13).

### Reference & Embedding Strategy

| Pattern                | Used for                                                                              | Why                                   |
| ---------------------- | ------------------------------------------------------------------------------------- | ------------------------------------- |
| Reference (ObjectId)   | `users`, `categories`, `brands`, `products`, `warehouses`                             | Shared, queried independently         |
| Embed (array/subdocs)  | `cart.items`, `order.lines`, `product.variants`, `product.images`, `address` in order | Owned by parent, always read together |
| Append-only collection | `inventory_transactions`, `order_events`, `activity_logs`                             | Unbounded history, auditable          |
| Snapshot embed         | order line `name/unitPrice/attributes` at purchase time                               | Prices change later; orders must not  |

---

## 3. Enum Definitions

```text
USER_ROLE        = USER | SELLER | ADMIN | SUPER_ADMIN
ACCOUNT_STATUS   = PENDING | VERIFIED | SUSPENDED | CLOSED

SELLER_STATUS    = PENDING | ACTIVE | SUSPENDED | REJECTED        (after KYC, §11)

PRODUCT_STATUS   = DRAFT | ACTIVE | ARCHIVED
CATEGORY_STATUS  = DRAFT | ACTIVE | HIDDEN
BRAND_STATUS     = DRAFT | ACTIVE | ARCHIVED

INVENTORY_TXN    = ADJUST | RESTOCK | RESERVE | RELEASE | DECREMENT | RETURN
STOCK_SOURCE     = SHARED | PER_VARIANT

ORDER_STATUS     = PENDING | CONFIRMED | PROCESSING | SHIPPED | DELIVERED
                 | COMPLETED | CANCELLED | RETURN_REQUESTED | RETURNED | REFUNDED

PAYMENT_STATUS   = PENDING | SUCCESS | FAILED | REFUNDED | PARTIALLY_REFUNDED
PAYMENT_GATEWAY  = PAYSTACK | MOMO | HUBTEL

REFUND_STATUS    = INITIATED | PROCESSING | COMPLETED | FAILED

CURRENCY         = GHS | NGN | USD                 (primary market GHS)

NOTIFICATION_CHANNEL = PUSH | EMAIL | IN_APP
NOTIFICATION_STATUS  = QUEUED | SENT | FAILED

REVIEW_STATUS    = PENDING | PUBLISHED | HIDDEN | REMOVED
```

> All enums are string-typed with a whitelist validator (`enum` in Mongoose + Zod).
> Unknown values are rejected at the API edge and in the schema.

---

## 4. Collections

### 4.1 `users`

Purpose: identity + auth + roles. Owned by the Auth module; referenced everywhere.

```text
{
  _id             ObjectId
  email           string        unique, lowercase, sparse (phone can be primary)
  phone           string        unique, sparse, E.164          [Africa's Talking OTP]
  displayName     string        required, 1..50
  bio             string        max 160 (short profile line — added Phase 1 user-profiles feature)
  avatar          { publicId, url, width, height }
  passwordHash    string        required (bcrypt; never select in reads)
  role            USER_ROLE     default USER
  status          ACCOUNT_STATUS
  isVerified      bool          (OTP verified)
  recoveryKeyHash string        sparse (E2EE recovery phrase hash — PROJECT_SPEC §15)
  addressBook     [{ label, street, city, region, country, isDefault }]  (embedded)
  settings        { locale, currency, theme, notifications }
  lastLoginAt     date
  deletedAt       date          null = active (soft delete)
  createdAt, updatedAt
}
```

Relationships: `1 — N` products (sellerId), `1 — N` orders (buyerId), `1 — N`
payments, `1 — 1` seller_profile.

Indexes:

```text
unique { email }            (sparse)
unique { phone }            (sparse)
{ role, status }
{ status, deletedAt }       (admin listings)
{ createdAt }               (analytics/backfills)
```

### 4.2 `seller_profiles`

Purpose: business identity + verification for marketplace sellers (`PROJECT_SPEC.md`
Phase 6 Business Accounts; KYC is an open decision — §11).

```text
{
  _id           ObjectId
  userId        ObjectId ref users      unique (1 — 1)
  businessName  string        required, unique
  slug          string        unique
  description   string
  logo          { publicId, url }
  contact       { email, phone, address }
  status        SELLER_STATUS default PENDING
  kyc           { status, submittedAt, verifiedAt, documents: [] }
  ratings       { average, count }       (denormalized from product_reviews)
  deletedAt     date
  createdAt, updatedAt
}
```

Indexes:

```text
unique { slug }
{ userId }
{ status }
{ kyc.status }
{ 'ratings.average' }        (sort by seller rating)
```

### 4.3 `categories`

Purpose: hierarchical product taxonomy.

```text
{
  _id          ObjectId
  name         string   required
  slug         string   unique
  parentId     ObjectId ref categories (null = root), self-reference
  order        number
  status       CATEGORY_STATUS default DRAFT
  attributes   [{ key, label, type }]     # attribute definitions for this category
  createdAt, updatedAt
}
```

Indexes:

```text
unique { slug }
{ parentId, status }
{ status, order }
```

### 4.4 `brands`

```text
{
  _id      ObjectId
  name     string  required
  slug     string  unique
  logo     { publicId, url }
  status   BRAND_STATUS default DRAFT
  createdAt, updatedAt
}
```

Indexes: `unique { slug }`, `{ status }`.

### 4.5 `products`

Purpose: the catalog unit. Variants, images, and attribute values embedded (they are
owned by the product and always read with it). Stock lives separately (§4.8) because it
must be mutated atomically and independently.

```text
{
  _id            ObjectId
  sellerId       ObjectId ref users            required
  sellerProfileId ObjectId ref seller_profiles
  categoryId     ObjectId ref categories       required
  brandId        ObjectId ref brands
  name           string   required
  slug           string   unique
  description    string
  status         PRODUCT_STATUS default DRAFT
  currency       CURRENCY default GHS
  basePrice      number   (integer minor units; used for shared stock / display)
  compareAtPrice number   (optional; minor units)
  attributes     Map      # attribute values by key (e.g. { color: 'Red', material: 'Cotton' })
  variants       [        # empty array when stockSource = SHARED
    {
      sku        string   unique
      attributes Map      # values that distinguish this variant
      price      number   (minor units; overrides basePrice)
      status     PRODUCT_STATUS
    }
  ]
  stockSource    STOCK_SOURCE default SHARED
  images         [{ publicId, url, alt, order }]
  ratingSummary  { average, count }            (denormalized)
  salesCount     number  (denormalized, for popularity sort)
  searchKeywords [string]                      (searchable terms incl. brand/category)
  deletedAt      date
  createdAt, updatedAt
}
```

Relationships: `N — 1` seller, `N — 1` category, `N — 1` brand, `1 — N`
`inventory_stock_items` (by sku), `1 — N` `product_reviews`.

Indexes:

```text
unique { slug }
{ sellerId, status }
{ sellerProfileId, status }
{ categoryId, status }
{ brandId, status }
{ status, basePrice }
{ status, ratingSummary.average }
{ status, salesCount }
{ 'variants.sku' } unique (sparse, when variants exist)
text index: name, description, searchKeywords   (interim until Typesense indexing is wired — §11)
```

Query path: all public catalog queries are prefixed `status: ACTIVE` and
`deletedAt: null` (see `ecommerce-product-catalog.md`).

### 4.6 `product_reviews`

```text
{
  _id          ObjectId
  productId    ObjectId ref products     required
  sellerProfileId ObjectId ref seller_profiles
  userId       ObjectId ref users        required
  orderId      ObjectId ref orders       required (purchase-gated: only confirmed buyers)
  rating       number 1..5               required
  title        string
  body         string
  images       [{ publicId, url }]
  status       REVIEW_STATUS default PENDING   (moderation — PROJECT_SPEC §9)
  createdAt, updatedAt
}
```

Indexes:

```text
{ productId, status, createdAt }         (catalog display)
{ sellerProfileId, status }
{ userId, orderId }  unique              (one review per product per order)
{ status, createdAt }                    (moderation queue)
```

### 4.7 `inventory_stock_items`

Purpose: current stock per SKU per warehouse. Stock is a counter maintained only via
atomic `$inc` from the inventory service (`ecommerce-inventory.md`).

```text
{
  _id          ObjectId
  sku          string        required   (references product.variants.sku or derived from product)
  productId    ObjectId ref products
  variantId    ObjectId     sparse      (present when stockSource = PER_VARIANT)
  warehouseId  ObjectId ref warehouses  required
  onHand       number   required, min 0 (physical count)
  reserved     number   required, min 0 (committed to confirmed orders)
  reorderPoint number   default 0       (low-stock threshold)
  unitCost     number                   (reporting only — never in public API)
  deletedAt    date
  createdAt, updatedAt
}
```

`available = onHand - reserved` is derived, never stored. Guard invariant:
`reserved <= onHand`.

Indexes:

```text
unique { sku, warehouseId }
{ productId, warehouseId }
{ warehouseId }
{ reorderPoint } + partial filter { available-approx via aggregation }  (low-stock scan)
```

### 4.8 `inventory_transactions`

Purpose: append-only ledger for every stock change. Grows fast — archival strategy in §8.

```text
{
  _id          ObjectId
  type         INVENTORY_TXN  required
  sku          string         required
  warehouseId  ObjectId ref warehouses
  quantity     number         required  (signed delta; negative for decrement/adjust)
  onHandAfter  number
  reservedAfter number
  reference    string         (orderId / adjustmentId)  — idempotency scope
  actor        ObjectId ref users
  note         string
  createdAt
}
```

Indexes:

```text
{ sku, createdAt }
{ reference, type }              (idempotency lookup)
{ warehouseId, createdAt }
{ createdAt } + TTL/archival     (§8)
```

### 4.9 `warehouses`

```text
{
  _id        ObjectId
  name       string   required
  code       string   unique
  address    string
  isDefault  bool
  status     ACTIVE | INACTIVE
  createdAt, updatedAt
}
```

Indexes: `unique { code }`, `{ status }`.

### 4.10 `carts`

```text
{
  _id         ObjectId
  userId      ObjectId ref users   unique (one active cart per user)
  currency    CURRENCY default GHS
  items       [
    {
      productId    ObjectId ref products
      variantId    ObjectId   (sparse)
      sku          string
      name         string     (snapshot)
      unitPrice    number     (minor units — snapshot)
      quantity     number     1..99
      attributes   Map        (snapshot for display)
      lineTotal    number     (derived, stored on write)
    }
  ]
  subtotal    number
  expiresAt   date              (abandoned cart TTL)
  createdAt, updatedAt
}
```

Indexes:

```text
unique { userId }
{ expiresAt } + TTL              (abandoned carts)
{ 'items.productId' }            (availability check sweeps)
```

### 4.11 `orders`

Purpose: source of truth for a purchase. Line items and addresses are **snapshots** —
later catalog changes never alter a confirmed order.

```text
{
  _id         ObjectId
  orderNumber string  unique        (human-facing, e.g., EAZ-100234)
  userId      ObjectId ref users    (buyer)
  status      ORDER_STATUS default PENDING
  currency    CURRENCY default GHS
  lines       [
    {
      productId, variantId?
      sku, name, attributes   (snapshot)
      unitPrice, quantity, lineTotal   (minor units)
    }
  ]
  totals      { subtotal, shippingFee, tax, total }   (minor units)
  shipping    { address: { street, city, region, country }, method, carrier?, trackingNo? , fee }
  payment     { reference, gateway, status }          (mirror of payments doc)
  notes       string
  cancelledBy string?          (BUYER | SELLER | ADMIN) + cancelReason
  deletedAt   date
  createdAt, updatedAt
}
```

Relationships: `N — 1` buyer, `1 — N` `order_events`, `1 — N` `payments` (retries),
`1 — N` `refunds`.

Indexes:

```text
unique { orderNumber }
{ userId, createdAt }            (buyer order list — paginated)
{ status }                       (seller/admin queues)
{ 'payment.reference' }          (webhook reconciliation)
{ 'shipping.carrier', 'shipping.trackingNo' }
{ sellerProfileId }              (seller's orders — via denormalized seller ref on line)
{ createdAt }                    (analytics)
```

State machine: `ORDER_STATUS` transitions are enforced in the order service
(`ecommerce-order-management.md`); the DB enforces valid enum + a `version` guard on
transition updates to prevent double-apply.

### 4.12 `order_events`

Purpose: append-only audit trail of every order transition.

```text
{
  _id       ObjectId
  orderId   ObjectId ref orders   required
  from      ORDER_STATUS?
  to        ORDER_STATUS          required
  by        ObjectId ref users
  role      USER_ROLE
  reason    string
  at        date
}
```

Indexes: `{ orderId, at }`, `{ to, at }` (analytics). Append-only — never updated.

### 4.13 `payments`

```text
{
  _id         ObjectId
  reference   string  unique           (server-generated, e.g., EAC-<uuid>)
  orderId     ObjectId ref orders
  userId      ObjectId ref users
  gateway     PAYMENT_GATEWAY
  amount      number  (minor units)
  currency    CURRENCY
  status      PAYMENT_STATUS default PENDING
  metadata    { }                       (e.g., items snapshot for reconciliation)
  gatewayRef  string  (Paystack transaction id — sparse, set on success)
  attempts    number
  initiatedAt, paidAt?, createdAt, updatedAt
}
```

Idempotency: one open `PENDING` payment per order; webhook fulfillment keyed by
`reference` (see `ecommerce-paystack.md`).

Indexes:

```text
unique { reference }
{ orderId, status }
{ userId, createdAt }
{ gatewayRef }  (sparse)
{ status, createdAt }                  (expiry sweeps)
```

### 4.14 `refunds`

```text
{
  _id         ObjectId
  paymentId   ObjectId ref payments    required
  orderId     ObjectId ref orders
  gateway     PAYMENT_GATEWAY
  amount      number  (minor units)
  reason      string
  status      REFUND_STATUS default INITIATED
  gatewayRef  string   (sparse)
  initiatedBy ObjectId ref users
  createdAt, updatedAt
}
```

Indexes: `{ paymentId, status }`, `unique { paymentId, gatewayRef }` (sparse),
`{ orderId }`.

### 4.15 `notifications`

Purpose: durable notification records (queued by BullMQ, read by mobile in-app center).

```text
{
  _id         ObjectId
  userId      ObjectId ref users   required
  channel     NOTIFICATION_CHANNEL
  type        string               (e.g., order:shipped)
  title, body string
  data        { }                  (target ids: orderId, etc.)
  status      NOTIFICATION_STATUS default QUEUED
  readAt      date
  createdAt, updatedAt
}
```

Indexes:

```text
{ userId, createdAt }             (in-app feed — paginated)
{ userId, readAt }
{ status, createdAt }             (delivery worker)
```

### 4.16 `activity_logs`

Purpose: admin audit trail (`ecommerce-admin-dashboard.md`). Append-only.

```text
{
  _id       ObjectId
  actor     ObjectId ref users
  action    string    (e.g., order.status.update)
  targetType string   (order, product, user, refund, settings)
  targetId  string
  before    { }       (sanitized — never passwords/tokens)
  after     { }
  ip        string
  at        date
}
```

Indexes: `{ targetType, targetId }`, `{ actor, at }`, `{ action, at }`.

### 4.17 `system_settings`

```text
{
  _id      ObjectId
  key      string  unique
  value    { }     (validated per key with Zod)
  updatedBy ObjectId ref users
  createdAt, updatedAt
}
```

Indexes: `unique { key }`. Cached in Redis; invalidated on write.

### 4.18 `otp_codes`

```text
{
  _id       ObjectId
  identifier string   (phone or email)
  purpose   string    (VERIFY | RESET | LOGIN)
  codeHash  string    (never store the OTP in plaintext)
  attempts  number
  expiresAt date
  createdAt
}
```

Indexes: `{ identifier, purpose, createdAt }`, `{ expiresAt }` + TTL.

### 4.19 `sessions`

Purpose: refresh-token families (`ecommerce-authentication.md`).

```text
{
  _id       ObjectId
  userId    ObjectId ref users
  deviceId  string   required
  jti       string   unique
  refreshTokenHash string   (sha256 — server never stores the raw token)
  createdAt, lastUsedAt, expiresAt
  revokedAt date
}
```

Indexes: `unique { jti }`, `{ userId }`, `{ deviceId }`, `{ expiresAt }` + TTL,
`{ revokedAt }` (partial, for family reuse detection).

---

## 5. Relationship Map

```text
users 1─N seller_profiles 1─N products 1─N product_reviews
users 1─N carts (1 active)
users 1─N orders 1─N order_events
users 1─N payments 1─N refunds
users 1─N sessions | otp_codes | notifications | activity_logs (via actor)

categories 1─N products (categoryId)        brands 1─N products (brandId)
products 1─N inventory_stock_items (sku)    warehouses 1─N inventory_stock_items
products 1─N inventory_transactions (sku)
orders 1─N payments (retries)  payments 1─N refunds
```

---

## 6. Validation Rules (Mongoose + Zod)

| Rule                              | Enforcement                                                             |
| --------------------------------- | ----------------------------------------------------------------------- |
| Money is integer minor units      | `min: 0`, integer validator; never float                                |
| `reserved <= onHand`              | schema pre-validate + atomic service guard                              |
| Enum whitelists                   | Mongoose `enum` + Zod literal unions                                    |
| Unique business keys              | unique indexes + pre-save dedupe check (graceful 409)                   |
| Required refs                     | `required` + `ref`; cascade handled in service (no DB cascade in Mongo) |
| Phone `E.164`                     | Zod regex; normalized before save                                       |
| Order lines snapshot immutability | transitions write new events; lines never mutated post-CONFIRMED        |
| Pagination limits                 | enforced at query layer (20/100)                                        |

---

## 7. Index Strategy Summary

| Collection             | Critical indexes                                                                       |
| ---------------------- | -------------------------------------------------------------------------------------- |
| users                  | unique email, unique phone (sparse), `{role,status}`                                   |
| seller_profiles        | unique slug, `{userId}`                                                                |
| categories             | unique slug, `{parentId,status}`                                                       |
| brands                 | unique slug                                                                            |
| products               | unique slug, `{categoryId,status}`, `{sellerId,status}`, price/rating/sales sort, text |
| product_reviews        | `{productId,status,createdAt}`, unique `{userId,orderId}`                              |
| inventory_stock_items  | unique `{sku,warehouseId}`, `{productId,warehouseId}`                                  |
| inventory_transactions | `{sku,createdAt}`, `{reference,type}`, TTL/archive                                     |
| carts                  | unique `{userId}`, `{expiresAt}` TTL                                                   |
| orders                 | unique `{orderNumber}`, `{userId,createdAt}`, `{status}`, `{payment.reference}`        |
| order_events           | `{orderId,at}`, `{to,at}`                                                              |
| payments               | unique `{reference}`, `{orderId,status}`, `{status,createdAt}`                         |
| refunds                | `{paymentId,status}`                                                                   |
| notifications          | `{userId,createdAt}`, `{status,createdAt}`                                             |
| activity_logs          | `{targetType,targetId}`, `{actor,at}`                                                  |
| system_settings        | unique `{key}`                                                                         |
| otp_codes              | `{identifier,purpose,createdAt}`, `{expiresAt}` TTL                                    |
| sessions               | unique `{jti}`, `{expiresAt}` TTL                                                      |

Every sort/filter field in the documented query paths is indexed. Verify with
`explain()` before release.

---

## 8. Scalability Considerations

1. **Read path**: catalog/products/orders lists are paginated and projected; hot reads
   (product detail, category tree) cached in Redis, invalidated on write by the owning
   service.
2. **Write path**: all money/stock writes are single-document atomic ops
   (`findOneAndUpdate` with guard filters / `$inc`) — no multi-doc transactions on hot
   paths. Cross-document consistency (payment → order → inventory) uses
   **compensating actions + BullMQ**, not transactions (`ecommerce-paystack.md`).
3. **Append-only collections** (`inventory_transactions`, `order_events`,
   `activity_logs`, `notifications`) are the growth vector:
   - `notifications`: TTL archive after 90 days; deliver from Redis cache.
   - `inventory_transactions`: aggregate/roll-up older than 90 days into daily summaries;
     archive raw to object storage (open decision §11).
   - `order_events` / `activity_logs`: archive after 1 year.
4. **Sharding readiness** (if a single replica set saturates):
   - `orders` shard key `userId` (buyer-scoped reads); `orderNumber` as a unique secondary
     requires a shard key that includes it — plan this before scale, not after.
   - `inventory_stock_items` shard key `sku`; `inventory_transactions` by `sku`.
   - `users`, `products`, `payments` remain on an unsharded primary until volume demands.
   - **Decision needed:** choose shard keys now so `_id`/unique constraint design doesn't
     need migration later.
5. **Caching**: Redis for catalog, cart reads, sessions/refresh families, settings, and
   analytics ranges. Cache-aside with explicit invalidation on writes.
6. **Cursor pagination** for high-volume feeds (notifications, inventory transactions,
   activity logs) — page-based for admin tables (`ecommerce-api-patterns.md`).
7. **Connection pooling / backpressure**: MongoDB pool sizing, `maxTimeMS` on aggregations,
   and slow-query monitoring per `ecommerce-backend-architecture.md`.

---

## 9. Data Integrity & Consistency

- **Money**: integer minor units everywhere; a rejected price is rejected at the schema
  and the API edge.
- **Stock**: single-writer rule — only the inventory service mutates
  `inventory_stock_items`; product/cart/order code reads derived availability
  (`ecommerce-inventory.md`).
- **Orders**: `version`-guarded transitions prevent double-apply of webhook retries;
  events record every change.
- **Payments**: idempotent by `reference`; webhook signature verified before state change
  (`ecommerce-paystack.md`).
- **Soft delete**: `deletedAt` filter appended to every read by the repository layer;
  unique keys must account for re-use after deletion (release `slug`/`email` explicitly).

---

## 10. Migration Strategy

- Use `migrate-mongo` (per `ENGINEERING_RULES.md` §4): forward + rollback scripts.
- Schema changes are additive first (new fields, sparse indexes); backfill data via
  scripts with `writeConcern: majority`.
- Index builds in rolling fashion on replicas (`background`/rolling) to avoid downtime.
- Every migration is reviewed by Database Architect; destructive changes require
  `PROJECT_SPEC` sign-off.

---

## 11. Open Decisions & Required Sign-offs

These map to `PROJECT_SPEC.md` §20 and **block implementation of the affected module**:

**Decided:** Soft-delete default (below) · E2EE (full) · OTP provider (Africa's Talking) ·
Offline local DB (WatermelonDB).

**Soft-delete default — RESOLVED:** soft-delete is the default for `users`,
`seller_profiles`, `categories`, `brands`, `products`, `product_reviews`,
`inventory_stock_items`, `warehouses`, `carts`, `orders`, `payments`, `refunds`,
`notifications`. Hard-delete + TTL applies to `otp_codes`, `sessions` (expired/revoked),
and append-only ledgers (`inventory_transactions`, `order_events`, `activity_logs`) are
never deleted, only archived. Every soft-deletable read filters `deletedAt: null` in the
repository layer; business keys (`slug`, `email`, `sku`) are explicitly released on
deletion to allow re-use.

| Decision                | Recommendation                                                                                                                                                                                                     | Blocks                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ |
| Search engine           | **Typesense (DECIDED Phase 2)** — self-hosted, GPL-3, RAM-bound index, Raft HA; public content only (Communities, Channels, Marketplace). Text index in §4.5 remains the interim fallback until indexing is wired. | Product search (Phase 3) |
| Object storage strategy | **Cloudinary-only** for MVP; design `{ publicId, url }` so S3-compatible swap is additive                                                                                                                          | Media at scale           |
| KYC requirements        | Lightweight (business name + ID upload) for Phase 3 go-live                                                                                                                                                        | `seller_profiles.kyc`    |
| Shard keys              | Decide before scale; see §8.4                                                                                                                                                                                      | Long-term                |
| Analytics tool          | PostHog (self-hostable) default                                                                                                                                                                                    | Phase 7                  |

**Unresolved does not block this design** — each is isolated to an optional field or an
interim index.

---

## 12. Review Checklist (Database Architect sign-off)

- [ ] Every collection has timestamps, validation, indexes, references, pagination.
- [ ] No duplicated source data; denormalization is documented and owned by one service.
- [ ] All money fields integer minor units with currency; no floats.
- [ ] Stock ledger + atomic single-document writes; no read-modify-write.
- [ ] Order/payment/refund state machines are enum-whitelisted and version-guarded.
- [ ] Idempotency keys on webhook-driven writes (`reference`, `{reference,type}`).
- [ ] TTL/archive strategy defined for all append-only collections.
- [ ] Soft-delete convention applied consistently (**decision signed** — §11).
- [ ] Every documented query path has a matching index; `explain()` verified.
- [ ] Reviewed with Backend Engineer (implementation), Security Engineer (auth/payments),
      and Project Architect (boundaries) before any model code is written.

**Sign-off status: PENDING** — pending the soft-delete decision and Architect review.
