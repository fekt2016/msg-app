import { Schema, model, type InferSchemaType, type Model, type Types } from 'mongoose';

// A single in-app channel for now; the collection shape matches
// DATABASE_DESIGN.md §4.15 so PUSH/EMAIL channels can be added later without
// a migration.
export const NOTIFICATION_CHANNEL = ['IN_APP'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNEL)[number];

// Whitelisted event types — a new event type first gets a schema-review, not a
// silent field-string. Mirrors the enum discipline in DATABASE_DESIGN.md §2.
export const NOTIFICATION_TYPES = [
  'chat:message',
  'community:role',
  'group:member:joined',
  'group:member:left',
  'channel:post:new',
  'channel:request:approved',
  'story:liked',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

const notificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    channel: { type: String, enum: NOTIFICATION_CHANNEL, default: 'IN_APP', required: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    body: { type: String, required: true, trim: true, maxlength: 300 },
    // Target ids + names for client deep-linking. Metadata only — never message
    // content (1:1 chat is E2EE and the server cannot read it).
    data: { type: Schema.Types.Mixed, default: {} },
    // Thread-style notifications (chat) coalesce into a single unread row per
    // conversation so a busy chat never floods the feed. Null for one-per-event
    // types.
    coalesceKey: { type: String, default: null },
    readAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// In-app feed is fetched cursor-paginated, newest first (secondary `_id` sort
// keeps pages deterministic).
notificationSchema.index({ userId: 1, createdAt: -1, _id: -1 });
// Unread-count queries (badge) filter on `readAt: null`.
notificationSchema.index({ userId: 1, readAt: 1 });

export type NotificationDoc = InferSchemaType<typeof notificationSchema> & {
  _id: Types.ObjectId;
};
export const NotificationModel: Model<NotificationDoc> = model<NotificationDoc>(
  'Notification',
  notificationSchema,
);
