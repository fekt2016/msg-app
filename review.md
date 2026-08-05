# Project Review: Eaz Community — Project Foundation

**Reviewed:** `.opencode/` docs (v2), `README.md`, `.gitignore`, `.env.example`, root `package.json`, empty `frontend/` + `backend/` workspaces, initialized git repo.

## Project Structure

```text
msg app/
│
├── .opencode/
│   ├── AGENTS.md              # AI agent responsibilities and workflow (v2)
│   ├── PROJECT_SPEC.md        # Full project specification (v2, phased)
│   ├── ENGINEERING_RULES.md   # Engineering and coding standards (v2)
│   ├── TASKS.md               # Feature task tracking (still v1)
│   ├── ROADMAP.md             # Development roadmap and milestones (v2)
│   └── prompts/               # Reusable agent prompts (empty, .gitkeep)
│
├── frontend/                  # React Native (Expo) mobile application (empty, .gitkeep)
├── backend/                   # Express.js + TypeScript API, Socket.IO, workers (empty, .gitkeep)
├── .claude/                   # Empty, unused AI config dir
├── .git/                      # Initialized git repo (1 commit)
├── README.md                  # Project documentation
├── review.md                  # This review
├── .env.example               # Environment variable template
├── .gitignore
└── package.json               # Root monorepo workspace (pnpm)
```

## Overall Status

The foundation is clean and well-scoped. However, the documentation has been edited with inline editorial notes (`Gap fixed:`, `Bug fixed:`, `Consistency fix:`), and those notes are now **inconsistent with the actual state of the repo**. Several docs reference files, tools, and ordering that don't exist yet or contradict each other. This is the main thing to fix before treating these as source-of-truth documents.

## What's Good

- Sensible monorepo layout (`frontend` / `backend` workspaces) with pnpm.
- `.env.example` is placeholder-only, no secrets, well-organized.
- `.gitignore` is comprehensive and production-ready.
- Roles, workflow, and completion rules are coherent and auditable.
- The "N/A is a signed-off decision, not a default" rule is a strong, enforceable principle.
- Phased development order (Commerce before Realtime Calls) is a genuinely good de-risking call.

## Blocking Issues (fix these)

1. **`README.md` documents a `docker-compose.yml` that does not exist.** It's in the folder tree, in Prerequisites, and in the setup steps (`docker compose up -d`). The file isn't in the repo. Either create it (Phase 0) or remove the references. Same with `.gitignore` listing `docker-compose.override.yml` — dangling.

2. **Docs reference files by wrong casing.** `AGENTS.md` says "Always follow `project_spec.md`" and "`engineering_rules.md`"; `ENGINEERING_RULES.md` §1 also references `project_spec.md`. The actual files are `PROJECT_SPEC.md` and `ENGINEERING_RULES.md`. This works on macOS (case-insensitive) but breaks on Linux/CI and in Claude. Standardize on the uppercase names everywhere.

3. **`TASKS.md` is still v1 and contradicts the new phasing.** It lists Voice Calls / Video Calls (steps 9–10) before Marketplace / Payments (steps 12–13), and it's missing the Moderation/Trust & Safety module. `PROJECT_SPEC.md` v2 moved Commerce ahead of Calls. TASKS.md must be reordered to match. It's also missing Phase 0 items (ESLint/Prettier/husky, Swagger scaffold, WatermelonDB/SQLite, test+coverage in CI).

4. **`pnpm install` will fail as-is.** Root `package.json` declares workspaces `frontend` and `backend`, but neither has a `package.json` yet (both are just `.gitkeep`). pnpm errors when a workspace glob matches a package-less directory. README step 2 says `pnpm install` works — it won't until each workspace gets a minimal `package.json`. The README commands (`pnpm --filter backend dev`, `lint`, `test`, `build`) document scripts that also don't exist yet.

5. **Editorial notes are polluting the source-of-truth docs.** `PROJECT_SPEC.md`, `ENGINEERING_RULES.md`, `ROADMAP.md`, and `README.md` contain review commentary ("Gap fixed — add:", "Bug fixed:", "Confirm this is the intended source of truth"). These read like meeting minutes, not requirements. Decide them into the spec, then delete the annotations. Notably, items written as _recommendations_ ("Gap fixed — add") are still open decisions but are presented in the README tech stack as if already decided (WatermelonDB, Paystack+MoMo/Hubtel, WebRTC/TURN, Sentry, PostHog).

## Non-Blocking Issues

6. `.env.example` is missing the vars implied by the spec additions: TURN/STUN creds, MoMo/Hubtel keys, search engine (Meilisearch/Typesense), object storage (Spaces/S3), Sentry DSN, PostHog, EAS project id.
7. `ROADMAP.md` still contains an open action item: "Confirm this is the intended source of truth" about phase ordering — resolve and remove.
8. `CLIENT_URL` and `FRONTEND_URL` are both `:3000` and arguably redundant in a mobile-first app; decide which one is real.
9. Empty `.claude/` directory in root is clutter; remove or delete since `.opencode/` is the active config.
10. No `LICENSE` file — fine if the project stays private (`"UNLICENSED"`), but decide before any public sharing.

## Open Decisions That Block Code

- **End-to-end encryption** for private chats (decide before Private Chat + Phase 1 message schema; it also gates AI summary/smart-reply).
- **OTP provider** (Twilio / Africa's Talking / Firebase Auth).
- **Search engine** (Atlas Search vs Meilisearch/Typesense) — needed by Phase 2.
- **Object storage** strategy (Cloudinary-only vs S3-compatible behind it).
- **Local DB** for offline mode (WatermelonDB vs expo-sqlite).
- **KYC/verification** for business accounts before Payments go live.
- **Soft vs hard delete** default convention.
- **Compliance pass** for Ghana Data Protection Act (Act 843).

## Recommended Next Step

Bring the repo to a consistent state first: (1) create `docker-compose.yml` or drop the references, (2) fix filename casing across all docs, (3) reorder/expand `TASKS.md` to v2 phasing, (4) add minimal `package.json` to `frontend/` and `backend/` so `pnpm install` works, (5) fold the "Gap fixed" notes into real spec text and remove the commentary, (6) update `.env.example` for the decided stack. Then resolve the open decisions (starting with E2EE and the OTP provider) before writing any feature code.
