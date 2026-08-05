---
name: eaz-image-upload
description: Cloudinary-backed media upload pattern for Eaz Community — validation, server-mediated upload flow, naming/folder conventions, galleries. Use when adding or reviewing any file/image upload endpoint or flow.
---

# Image Upload (Cloudinary)

## Purpose

Standardize how images (and general media) are uploaded, validated, optimized, and served so all upload flows are consistent, cheap to host, and safe.

## Scope

- Cloudinary uploads
- Image validation and compression
- Folder structure and naming conventions
- Single and multiple uploads
- Galleries (e.g., product images, once Marketplace exists)
- Error handling

## Architecture Principles

1. **Server-mediated uploads**: uploads go through the backend (Multer → Cloudinary) with the secret key server-side only. Direct client uploads use signed upload presets if ever enabled — never expose `CLOUDINARY_API_SECRET`.
2. **Validate before upload**: type, size, dimensions, and content are checked before any bytes reach Cloudinary.
3. **URLs are derived, not stored raw**: store the Cloudinary `public_id` and build optimized URLs via Cloudinary transform params at render time.
4. **Naming is deterministic and namespaced**: `eaz/<env>/<module>/<entityId>/<sanitized-name>` so assets are organized and greppable.
5. **Galleries are ordered and immutable-ish**: image order is a first-class field; replacing an image keeps the same slot.

## Required Patterns

### Validation

- Allowed types: `image/jpeg`, `image/png`, `image/webp` (per module rules). Reject everything else by MIME _and_ magic-byte sniffing (not just `Content-Type` header) — this is what the implemented avatar upload does (`backend/src/modules/users/avatarUpload.ts`, `mediaStorage.ts`).
- Max size per file enforced by Multer `limits` (`AVATAR_MAX_SIZE_MB` env) and re-checked in the service.
- Max dimensions enforced via a lightweight decode check before upload where relevant.
- Validate file count for multi-upload at the Zod layer.

### Upload Flow (backend)

```
Route → authenticate/authorize → Multer memory storage → validation middleware
→ service: stream to Cloudinary (folder, public_id, format, eager transforms)
→ store { public_id, secure_url, width, height, bytes, format } on the entity
→ clean up temp buffer → return normalized asset DTO
```

- `multer` with `memoryStorage` and a size limit; never write user uploads to disk.
- Upload to Cloudinary with explicit `folder`, `public_id`, `overwrite: false`, `resource_type: 'auto'`.
- Generate eager transforms (e.g., `w_800,q_auto,f_auto`) so delivery is pre-optimized.
- The implemented pattern uses a real-provider + `Logging*Provider` dev fallback (see `mediaStorage.ts`) consistent with `eaz-backend-architecture`'s optional-integration convention — reuse it for any new upload surface rather than a bespoke Cloudinary call.

### Naming & Folder Conventions

- `folder`: `eaz/{env}/{module}` (e.g., `eaz/production/avatars`).
- `public_id`: `${entityId}/${slug}-${uuid}` — unique per asset, collision-safe.
- Never use the raw user filename as the `public_id` (XSS/injection surface and collisions).

### Multiple Uploads & Galleries

- An endpoint accepting an array uploads sequentially or with limited concurrency (e.g., 3 at a time) to stay within rate limits.
- All-or-nothing on validation errors: if one file fails validation, none are persisted; clean up already-uploaded assets on partial failure.
- Ordered gallery arrays: `images: [{ publicId, url, alt, order }]`; reorder via a dedicated endpoint, not by re-uploading.

### Serving / Optimization

- Render `secure_url` with transform params (quality/format auto, width per usage) — Cloudinary does the compression; the app never resizes client-side.
- Provide `alt` text everywhere; accessibility for image content.

### Error Handling

- Multer/Cloudinary errors map to typed errors (file too large → `413`, invalid type → `415`, upload failure → `502`).
- On Cloudinary partial failure, delete successfully-uploaded assets before responding.
- Never swallow upload errors into a generic 500 — the client needs actionable feedback.

## Best Practices

- Env: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` (see `.env.example`).
- Keep an upload middleware/service that is module-agnostic and reusable — extend `mediaStorage.ts` rather than writing a second Cloudinary integration.
- Store byte size + dimensions for later quota/reporting.
- Log uploads (size, module, entity) without file contents.

## Performance Considerations

- Eager transforms + `f_auto/q_auto` keep delivery light for clients.
- Avoid re-uploading for resizes — Cloudinary transforms on the fly.
- Rate-limit upload endpoints; large files are a common abuse vector.
- Offload any post-processing (e.g. thumbnail generation for Stories) to BullMQ.

## Security Considerations

- Validate content type by magic bytes, not headers.
- Never echo or store raw user filenames/paths.
- Ownership checks before attaching images to an entity.
- Sanitize `alt` and caption fields.
- Keep the API secret server-side; signed upload presets (with expiry) if direct upload is ever needed.

## Anti-Patterns to Avoid

- Uploading straight to Cloudinary from the client with the secret embedded.
- Trusting `Content-Type` without content sniffing.
- Using user-supplied filenames as `public_id`.
- Storing unoptimized `secure_url` and letting clients re-download large images.
- Ignoring partial multi-upload failures.

## Common Mistakes

- Missing size/type validation → storage abuse.
- Duplicate assets from non-deterministic naming.
- Galleries with no ordering field → inconsistent UI.
- Deleting images from Cloudinary without removing the DB reference.

## Implementation Checklist

1. Confirm storage strategy (Cloudinary-only vs. S3-compatible behind it is still an open decision, `.opencode/PROJECT_SPEC.md` §20) before adding a second storage backend.
2. Reuse/extend `backend/src/modules/users/mediaStorage.ts` rather than writing a new Cloudinary integration.
3. Implement content sniffing + size/dimension checks before any upload.
4. Add tests for validation, partial-failure cleanup, and ownership — see `eaz-testing`.
