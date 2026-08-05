# @eaz-community/frontend

Eaz Community mobile app — React Native + Expo (SDK 57) + TypeScript.

## Local Development

```bash
pnpm --filter frontend dev      # Expo dev server
pnpm --filter frontend test     # Jest (jest-expo) with coverage
pnpm --filter frontend lint
pnpm --filter frontend typecheck
pnpm --filter frontend build    # expo export (static JS bundles)
```

## Native Builds (WatermelonDB)

This workspace uses WatermelonDB (`@nozbe/watermelondb`) for offline
persistence. WatermelonDB includes native modules, so the app **cannot
run in Expo Go** — use a development build:

```bash
pnpm --filter frontend expo run:ios
pnpm --filter frontend expo run:android
```

(or `pnpm --filter frontend expo prebuild` then open in Xcode/Android
Studio).

## Database Structure

- `src/db/schema.ts` — WatermelonDB schema (version-bumped on every change)
- `src/db/database.ts` — `createDatabase()` / `getDatabase()` singleton;
  SQLite adapter in the app, LokiJS in-memory adapter under Jest
- `src/db/models/` — WatermelonDB Model classes, added per feature (Phase 1+)
- `src/db/index.ts` — public barrel (schema, database, `DatabaseProvider`, `useDatabase`)

`App.tsx` wraps the tree in `DatabaseProvider`. When a schema changes,
increment `databaseVersion` in `schema.ts`; the SQLite adapter migrates
automatically (no migrations defined yet).
