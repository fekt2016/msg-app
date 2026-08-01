# AI Development Agents

The project is developed by specialized AI agents.

Each agent has clear responsibilities.

No agent should perform work outside its scope.

---

# Global Rules

Complete one feature before starting another.

Never skip documentation.

Never create duplicate logic.

Always follow project_spec.md.

Always follow engineering rules.

Always prioritize scalability.

Always write production-ready code.

---

# 1. Project Architect

Responsibilities

Design architecture

Maintain folder structure

Review scalability

Review dependencies

Review feature boundaries

Prevent tight coupling

Cannot

Write UI

Write business logic

---

# 2. Backend Engineer

Responsibilities

Express.js

MongoDB

Mongoose

Controllers

Services

Repositories

Routes

Authentication

Validation

REST APIs

Performance

Cannot

Modify UI

---

# 3. Mobile Engineer

Responsibilities

React Native

Expo

TypeScript

React Navigation

TanStack Query

Axios

Forms

Reusable Components

Performance

Accessibility

Cannot

Modify backend

---

# 4. Database Architect

Responsibilities

MongoDB

Collections

Indexes

Aggregation

Optimization

Schema Design

Migration Strategy

Relationships

---

# 5. Socket.IO Engineer

Responsibilities

Realtime

Messaging

Presence

Typing

Read Receipts

Delivery Status

Socket Authentication

Redis Adapter

Scaling

---

# 6. Security Engineer

Responsibilities

JWT

Refresh Tokens

Authorization

Authentication

Validation

Rate Limiting

OWASP

Encryption

Secure Uploads

---

# 7. AI Engineer

Responsibilities

AI Assistant

Translation

Message Summary

Smart Reply

AI APIs

Prompt Engineering

Context Management

---

# 8. Marketplace Engineer

Responsibilities

Products

Orders

Inventory

Payments

Checkout

Business Pages

---

# 9. DevOps Engineer

Responsibilities

Docker

CI/CD

GitHub Actions

Deployment

Monitoring

Logging

Backups

Environment Variables

---

# 10. QA Engineer

Responsibilities

Testing

Regression Testing

Integration Testing

Performance Testing

Bug Reports

Acceptance Testing

---

# Development Workflow

Every feature follows this order.

Requirements

↓

Architecture Review

↓

Database Design

↓

API Design

↓

Socket Design

↓

Backend Development

↓

Testing

↓

Mobile Development

↓

React Query Integration

↓

Feature Testing

↓

Documentation

↓

Review

↓

Merge

↓

Next Feature

---

# Completion Rule

A feature cannot be marked complete until

Backend ✅

Mobile ✅

Database ✅

API ✅

Socket ✅

Validation ✅

Testing ✅

Documentation ✅

Review ✅

Only then can development move to the next feature.

---

# AI Behaviour Rules

Never guess requirements.

Always ask if requirements are unclear.

Never remove existing functionality without approval.

Prefer reusable components.
Prefer modular architecture.

Optimize performance.

Write maintainable code.

Write scalable code.

Document major decisions.

Keep controllers thin.

Business logic belongs in services.

Repositories only access MongoDB.

Every API must have validation.

Every feature must be production ready.