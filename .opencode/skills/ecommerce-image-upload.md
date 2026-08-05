---
model: anthropic/claude-sonnet-4-6
---

# Skill: Image Upload (Cloudinary)

## Purpose

Standardize how product images (and general media) are uploaded, validated, optimized, and served so all upload flows are consistent, cheap to host, and safe.

## Scope

- Cloudinary uploads
- Image validation and compression
- Folder structure and naming conventions
- Single and multiple uploads
- Product galleries
- Error handling

## Architecture Principles

1. **Server-mediated uploads**: uploads go through the backend (Multer → Cloudinary) with secret key server-side only. Direct client uploads use signed upload presets if ever enabled — never expose `CLOUDINARY_API_SECRET`.
2. **Validate before upload**: type, size, dimensions, and content are checked before any bytes reach Cloudinary.
3. **URLs are derived, not stored raw**: store the Cloudinary `public_id` and build optimized URLs via Cloudinary transform params at render time.
4. **Naming is deterministic and namespaced**: `eaz/<env>/<module>/<entityId>/<sanitized-name>` so assets are organized and greppable.
5. **Galleries are ordered and immutable-ish**: image order is a first-class field; replacing an image keeps the same slot.

## Required Patterns

### Validation

- Allowed types: `image/jpeg`, `image/png`, `image/webp` (and audio/video per module rules). Reject everything else by MIME _and_ magic-byte sniffing (not just `Content-Type` header).
- Max size per file (e.g., 10 MB) enforced by Multer `limits` and re-checked.
- Max dimensions enforced via a lightweight decode check before upload.
- Validate file count for multi-upload (e.g., max 9 gallery images) at the Zod layer.

### Upload Flow (backend)

```
Route → authenticate/authorize → Multer memory storage → validation middleware
→ service: stream to Cloudinary (folder, public_id, format, eager transforms)
→ store { public_id, secure_url, width, height, bytes, format } on the entity
→ clean up temp buffer → return normalized asset DTO
```

- Use `multer` with `memoryStorage` and a size limit; never write user uploads to disk.
- Upload to Cloudinary with explicit `folder`, `public_id`, `overwrite: false`, `resource_type: 'auto'`.
- Generate eager transforms (e.g., `w_800,q_auto,f_auto`) so delivery is pre-optimized.

### Naming & Folder Conventions

- `folder`: `eaz/{env}/{module}` (e.g., `eaz/production/products`).
- `public_id`: `${entityId}/${slug}-${uuid}` — unique per asset, collision-safe.
- Never use the raw user filename as the `public_id` (XSS/injection surface and collisions).

### Multiple Uploads & Galleries

- Endpoint accepts an array; uploads run sequentially or with limited concurrency (e.g., 3 at a time) to stay within rate limits.
- All-or-nothing on validation errors: if one file fails validation, none are persisted; clean up already-uploaded assets on partial failure.
- Gallery stored on Product as `images: [{ publicId, url, alt, order }]`; reorder via a dedicated endpoint, not by re-uploading.

### Serving / Optimization

- Render `secure_url` with transform params (quality/format auto, width per usage) — Cloudinary does the compression; the app never resizes client-side.
- Use `next/image` on web for further optimization and caching — see `ecommerce-nextjs-architecture.md`.
- Provide `alt` text everywhere; accessibility for product galleries.

### Error Handling

- Multer/Cloudinary errors map to typed errors (e.g., file too large → `413`, invalid type → `415`, upload failure → `502`).
- On Cloudinary partial failure, delete successfully-uploaded assets before responding.
- Never swallow upload errors into a generic 500 — the client needs actionable feedback.

## Best Practices

- Set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` via env (see `.env.example`).
- Keep an upload middleware/service that is module-agnostic and reusable.
- Store byte size + dimensions for later quota/reporting.
- Log uploads (size, module, entity) without file contents.

## Performance Considerations

- Eager transforms + `f_auto/q_auto` keep delivery light for clients.
- Avoid re-uploading for resizes — Cloudinary transforms on the fly.
- Rate-limit upload endpoints; large files are a common abuse vector.
- Offload any post-processing (thumbnail generation for stories) to BullMQ — see `ecommerce-backend-architecture.md`.

## Security Considerations

- Validate content type by magic bytes, not headers.
- Never echo or store raw user filenames/paths.
- Ownership checks before attaching images to an entity (sellers attach to own products).
- Sanitize `alt` and caption fields.
- Keep API secret server-side; signed upload presets (with expiry) if direct upload is needed.

## Anti-Patterns to Avoid

- Uploading straight to Cloudinary from the client with the secret embedded.
- Trusting `Content-Type` without content sniffing.
- Using user-supplied filenames as `public_id`.
- Storing unoptimized `secure_url` and letting clients re-download 5 MB images.
- Ignoring partial multi-upload failures.

## Common Mistakes

- Missing size/type validation → storage abuse.
- Duplicate assets from non-deterministic naming.
- Galleries with no ordering field → inconsistent UI.
- Deleting images from Cloudinary without removing the DB reference.
- Not cleaning up temp memory buffers.

## AI Implementation Instructions

1. Read media requirements in `PROJECT_SPEC.md` (Media Upload step) and confirm storage strategy (Cloudinary vs S3-compatible behind it) with the Project Architect.
2. Build a reusable upload module per `ecommerce-backend-architecture.md`: validation middleware, upload service, gallery endpoints.
3. Implement content sniffing + size/dimension checks before any upload.
4. Wire product galleries and seller avatars to the module with ownership checks.
5. Add tests for validation, partial-failure cleanup, and ownership — see `ecommerce-testing.md`.
6. Update `TASKS.md`; do not mark complete until review.
