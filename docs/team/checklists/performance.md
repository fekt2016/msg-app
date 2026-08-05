# Performance Checklist

Walked by the `performance` agent. Full rationale in `CLAUDE.md` §12.

- [ ] Every filter/sort/`$match` field is indexed — verified with `explain()`, not assumed
- [ ] No `find()` over a whole collection; `limit()` + projection on every read
- [ ] `lean()` used on read-only Mongoose queries
- [ ] List endpoints paginated (default 20, max 100) and enforced server-side regardless of client input
- [ ] No N+1 query patterns
- [ ] Hot, infrequently-written reads cached in Redis with explicit invalidation on write
- [ ] Heavy/slow/retryable work queued via BullMQ, never `await`ed inline in a request handler
- [ ] No read-modify-write on any money/stock path — atomic `$inc`/guarded `findOneAndUpdate` only
- [ ] Cursor pagination used (with deterministic secondary sort) on high-volume feeds
- [ ] Response payloads project only what the client renders

Findings are recommendations with evidence (query plan, benchmark, or a concrete traffic estimate) — not vibes. A finding without evidence goes back for measurement before it blocks anything.
