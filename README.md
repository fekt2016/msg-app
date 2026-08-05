# Eaz Community (Working Name)

A modern community-first communication platform for Ghana and Africa, combining messaging, communities, AI, marketplace, and digital payments into one cross-platform mobile application.

## Overview

Eaz Community is a full-stack, production-ready application built for Android and iOS. It connects individuals, businesses, schools, churches, organizations, and communities to communicate, collaborate, and transact securely. The platform is being built feature by feature with a focus on security, performance, scalability, and offline-friendly experiences.

## Folder Structure

```text
project/
│
├── .opencode/
│   ├── AGENTS.md              # AI agent responsibilities and workflow
│   ├── PROJECT_SPEC.md        # Full project specification
│   ├── ENGINEERING_RULES.md   # Engineering and coding standards
│   ├── TASKS.md               # Feature task tracking
│   ├── ROADMAP.md             # Development roadmap and milestones
│   └── prompts/               # Reusable agent prompts
│
├── frontend/                  # React Native (Expo) mobile application
├── backend/                   # Express.js + TypeScript API, Socket.IO, workers
├── docker-compose.yml         # Local MongoDB, Redis, and service orchestration
├── pnpm-workspace.yaml        # pnpm workspace configuration
├── README.md
├── .env.example               # Environment variable template
├── .gitignore
└── package.json               # Root monorepo workspace
```

> **Gap fixed:** added `docker-compose.yml` to the tree — Prerequisites
> below asked contributors to install MongoDB and Redis locally, which
> contradicts the Docker-based infra described elsewhere in these
> docs. Local dev should run against Dockerized MongoDB/Redis, not a
> native install, so both stay consistent with how staging/production
> run.

## Getting Started

### Prerequisites

- Node.js 20+ (LTS recommended)
- pnpm (preferred package manager) or npm / Yarn
- Docker + Docker Compose (for local MongoDB, Redis, and services)

### Installation

1. Clone the repository:

   ```bash
   git clone <repository-url>
   cd project
   ```

2. Install workspace dependencies:

   ```bash
   pnpm install
   ```

3. Copy the environment template:

   ```bash
   cp .env.example backend/.env
   ```

4. Fill in the environment variables in `backend/.env` with your own values.

5. Start local infrastructure (MongoDB, Redis):

   ```bash
   docker compose up -d
   ```

6. Start the backend:

   ```bash
   pnpm --filter backend dev
   ```

7. Start the mobile app:

   ```bash
   pnpm --filter frontend dev
   ```

> **Bug fixed:** the original commands (`pnpm dev --filter backend`)
> put the filter flag after the script name — pnpm requires
> `--filter <package>` _before_ the script (`pnpm --filter backend
dev`). As originally written, these would fail.

> Detailed setup for each workspace lives in its own README as the workspaces are initialized.

### Common Scripts

**Gap fixed — new section.** The original README never documented how
to lint, test, or build — a new contributor has no way to know these
exist without reading `ENGINEERING_RULES.md` first.

```bash
pnpm --filter backend lint      # ESLint
pnpm --filter backend test      # Test suite + coverage
pnpm --filter backend build     # TypeScript build

pnpm --filter frontend lint
pnpm --filter frontend test
```

## Development Workflow

Every feature follows this order:

1. Requirements
2. Architecture Review
3. Database Design _(skip if no schema change — confirmed in Architecture Review)_
4. API Design
5. Socket Design _(skip if no realtime component — confirmed in Architecture Review)_
6. Backend Development
7. Testing
8. Mobile Development
9. React Query Integration
10. Feature Testing
11. Documentation
12. Review
13. Merge

A feature is not complete until backend, mobile, database _(or N/A)_,
API, socket _(or N/A)_, validation, testing, documentation, and review
are all done.

> **Consistency fix:** this list previously stated Database and Socket
> as unconditional steps, which conflicts with the N/A allowance now
> established in `.opencode/ENGINEERING_RULES.md`. Aligned the wording
> here so all three documents (`PROJECT_SPEC.md`, `ENGINEERING_RULES.md`,
> `ROADMAP.md`, and this README) agree.

See [.opencode/AGENTS.md](.opencode/AGENTS.md) for the agent workflow and [.opencode/ROADMAP.md](.opencode/ROADMAP.md) for the current milestone.

## Technology Stack

### Mobile

- React Native, Expo, TypeScript
- React Navigation, TanStack Query, Axios
- Socket.IO Client, React Hook Form, Zod
- WatermelonDB / expo-sqlite _(offline persistence — see `PROJECT_SPEC.md` §6)_

### Backend

- Express.js, TypeScript
- MongoDB, Mongoose
- Socket.IO, Redis, BullMQ
- JWT, Cloudinary, Multer
- Paystack (+ MoMo/Hubtel) _(payments — see `PROJECT_SPEC.md` §6)_
- WebRTC signaling + TURN/STUN _(voice/video calls)_

### Infrastructure

- Docker, GitHub + GitHub Actions
- Firebase Cloud Messaging
- AWS / DigitalOcean, Nginx
- Sentry _(error tracking)_

> **Gap fixed:** the stack list here had drifted out of sync with the
> additions made to `PROJECT_SPEC.md` (payments, WebRTC/TURN, offline
> DB, error tracking). Updated to match so the README isn't the stale
> copy.

## Contribution Guidelines

1. Follow the roles defined in [.opencode/AGENTS.md](.opencode/AGENTS.md). Each agent works only within its scope.
2. Follow [.opencode/ENGINEERING_RULES.md](.opencode/ENGINEERING_RULES.md) and [.opencode/PROJECT_SPEC.md](.opencode/PROJECT_SPEC.md).
3. Complete one feature before starting another, within the current roadmap phase. Never leave unfinished modules.
4. Write TypeScript only. Keep controllers thin, business logic in services, and data access in repositories.
5. Every API must have validation and error handling.
6. Never commit real secrets. Use `.env.example` as the template and keep `.env` files out of version control.
7. Document every feature and every major decision before merging.
8. Track progress in [.opencode/TASKS.md](.opencode/TASKS.md) and keep [.opencode/ROADMAP.md](.opencode/ROADMAP.md) up to date.
9. CI (lint, test, typecheck) must pass before a PR is mergeable — see `ENGINEERING_RULES.md` §12.
