# Engineering Rules

Non-negotiable engineering standards for the Eaz Community project.

---

## 1. General

Complete one feature before starting another.

Never skip documentation.

Never create duplicate logic.

Always prioritize scalability.

Always write production-ready code.

Never remove existing functionality without approval.

Never guess requirements; ask when unclear.

---

## 2. Backend Rules

Express.js only.

Use TypeScript.

MongoDB only.

Use Mongoose.

Service Layer Architecture.

Repository Pattern.

Socket.IO for realtime.

REST APIs.

JWT Authentication.

Redis for cache.

BullMQ for queues.

Keep controllers thin.

Business logic belongs in services.

Repositories only access MongoDB.

---

## 3. API Rules

RESTful API.

Versioned APIs under /api/v1.

Consistent response format.

Proper HTTP status codes.

Input validation on every endpoint.

Centralized error handling.

No business logic in route handlers.

---

## 4. Database Rules

Use MongoDB.

Use Mongoose.

Every schema must have:

- timestamps
- indexes
- validation
- references
- pagination support

No duplicated data.

Design schemas for scale (indexes on query fields).

---

## 5. Socket Rules

Socket.IO only.

Realtime events must be documented.

No business logic inside socket handlers.

Authentication required on socket connections.

Use Redis adapter for horizontal scaling.

---

## 6. Security Rules

JWT with short-lived access tokens.

Refresh tokens for long-lived sessions.

OTP for sensitive flows.

Rate limiting on public endpoints.

Helmet for security headers.

CORS configured explicitly.

Input validation and sanitization.

Encryption for sensitive data.

Secure file uploads (validate types, sizes, content).

Follow OWASP guidelines.

Never commit secrets.

---

## 7. Coding Standards

TypeScript only; no JavaScript.

Small, reusable functions.

Feature-based folder organization.

Thin controllers.

Business logic in services.

Repositories only access MongoDB.

Reusable utilities.

Consistent naming conventions.

No dead code.

Every public API documented.

---

## 8. Mobile Rules

React Native Expo.

TypeScript.

TanStack Query for server state.

Axios for HTTP.

Reusable components.

Feature-based folder structure.

Offline support for core flows.

Accessibility respected.

---

## 9. Testing Rules

Backend APIs must have tests.

Mobile components and hooks must have tests.

Regression testing before each release.

Integration testing across backend layers.

Performance testing for realtime and high-traffic flows.

Bug reports must include reproduction steps.

---

## 10. Feature Completion Checklist

A feature is complete only if:

- Backend complete
- Mobile complete
- Database complete
- API complete
- Socket complete
- Validation complete
- Error handling complete
- Testing complete
- Documentation updated
- Code reviewed
- Merged

---

## 11. Environment & Config

All configuration through environment variables.

Use .env.example as the template.

Never commit .env files.

Validate environment variables at application startup.

---

## 12. Git Workflow

Small, focused commits.

Meaningful commit messages.

One feature per branch/PR.

Code review before merge.

Keep the main branch deployable at all times.
