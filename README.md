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
├── README.md
├── .env.example               # Environment variable template
├── .gitignore
└── package.json               # Root monorepo workspace
```

## Getting Started

### Prerequisites

- Node.js 20+ (LTS recommended)
- pnpm (preferred package manager) or npm / Yarn
- MongoDB 6+
- Redis 7+

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

5. Start the backend:

   ```bash
   pnpm dev --filter backend
   ```

6. Start the mobile app:

   ```bash
   pnpm dev --filter frontend
   ```

> Detailed setup for each workspace lives in its own README as the workspaces are initialized.

## Development Workflow

Every feature follows this order:

1. Requirements
2. Architecture Review
3. Database Design
4. API Design
5. Socket Design
6. Backend Development
7. Testing
8. Mobile Development
9. React Query Integration
10. Feature Testing
11. Documentation
12. Review
13. Merge

A feature is not complete until backend, mobile, database, API, socket, validation, testing, documentation, and review are all done.

See [.opencode/AGENTS.md](.opencode/AGENTS.md) for the agent workflow and [.opencode/ROADMAP.md](.opencode/ROADMAP.md) for the current milestone.

## Technology Stack

### Mobile

- React Native
- Expo
- TypeScript
- React Navigation
- TanStack Query
- Axios
- Socket.IO Client
- React Hook Form
- Zod

### Backend

- Express.js
- TypeScript
- MongoDB
- Mongoose
- Socket.IO
- Redis
- BullMQ
- JWT
- Cloudinary
- Multer

### Infrastructure

- Docker
- GitHub + GitHub Actions
- Firebase Cloud Messaging
- AWS / DigitalOcean
- Nginx

## Contribution Guidelines

1. Follow the roles defined in [.opencode/AGENTS.md](.opencode/AGENTS.md). Each agent works only within its scope.
2. Follow [.opencode/ENGINEERING_RULES.md](.opencode/ENGINEERING_RULES.md) and [.opencode/PROJECT_SPEC.md](.opencode/PROJECT_SPEC.md).
3. Complete one feature before starting another. Never leave unfinished modules.
4. Write TypeScript only. Keep controllers thin, business logic in services, and data access in repositories.
5. Every API must have validation and error handling.
6. Never commit real secrets. Use `.env.example` as the template and keep `.env` files out of version control.
7. Document every feature and every major decision before merging.
8. Track progress in [.opencode/TASKS.md](.opencode/TASKS.md) and keep [.opencode/ROADMAP.md](.opencode/ROADMAP.md) up to date.
