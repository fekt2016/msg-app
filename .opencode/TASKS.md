# TASKS.md

Feature task tracking for the Eaz Community project.

Status legend:

- `[ ]` Not started
- `[~]` In progress
- `[x]` Complete

Completion rule: a feature is complete only when Backend, Mobile, Database, API, Socket, Validation, Testing, Documentation, and Review are all done (see AGENTS.md and ENGINEERING_RULES.md).

---

## Project Setup

- [x] Project foundation (folders, README, .env.example, .gitignore, root workspace)
- [ ] Initialize backend workspace (Express.js + TypeScript)
- [ ] Initialize frontend workspace (React Native + Expo + TypeScript)
- [ ] Docker setup for MongoDB, Redis, backend, frontend
- [ ] CI/CD pipeline (GitHub Actions)

## 1. Authentication

- [ ] User registration
- [ ] User login
- [ ] OTP verification
- [ ] Refresh token flow
- [ ] Password reset
- [ ] Mobile auth screens
- [ ] Auth persistence

## 2. User Profile

- [ ] Profile schema
- [ ] Profile CRUD APIs
- [ ] Avatar upload (Cloudinary)
- [ ] Mobile profile screens

## 3. Private Chat

- [ ] Conversation schema
- [ ] Message schema
- [ ] Chat REST APIs
- [ ] Socket events (send, receive, read receipts)
- [ ] Mobile chat UI
- [ ] Offline queue

## 4. Media Upload

- [ ] Upload APIs (Multer + Cloudinary)
- [ ] Validation and secure uploads
- [ ] Media gallery in chats

## 5. Group Chat

- [ ] Group schema
- [ ] Group APIs (create, join, leave, roles)
- [ ] Group socket events
- [ ] Mobile group UI

## 6. Communities

- [ ] Community schema
- [ ] Community APIs
- [ ] Community socket events
- [ ] Mobile community UI

## 7. Channels

- [ ] Channel schema
- [ ] Channel APIs
- [ ] Mobile channel UI

## 8. Stories

- [ ] Story schema
- [ ] Story APIs
- [ ] Story socket events
- [ ] Mobile stories UI

## 9. Voice Calls

- [ ] Voice call signaling
- [ ] Mobile voice call UI

## 10. Video Calls

- [ ] Video call signaling
- [ ] Mobile video call UI

## 11. Notifications

- [ ] Notification schema
- [ ] FCM push notifications
- [ ] In-app notification center

## 12. Marketplace

- [ ] Product schema
- [ ] Product APIs
- [ ] Inventory
- [ ] Business pages

## 13. Payments

- [ ] Paystack integration
- [ ] Checkout flow
- [ ] Order schema and APIs
- [ ] Webhooks

## 14. AI Assistant

- [ ] AI assistant chat
- [ ] Translation
- [ ] Message summary
- [ ] Smart reply
- [ ] Context management

## 15. Business Accounts

- [ ] Business account schema
- [ ] Business account APIs
- [ ] Mobile business UI

## 16. Admin Dashboard

- [ ] Admin APIs
- [ ] Admin web dashboard
- [ ] Reports and moderation

## 17. Settings

- [ ] User settings APIs
- [ ] Mobile settings screens
- [ ] Privacy controls

## 18. Analytics

- [ ] Event tracking
- [ ] Analytics dashboards

## 19. Release

- [ ] Play Store release
- [ ] App Store release
- [ ] Production deployment
- [ ] Monitoring and logging
