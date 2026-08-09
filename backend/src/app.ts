import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env.js';
import { swaggerSpec } from './api-docs/swagger.js';
import { healthRouter } from './routes/health.routes.js';
import authRouter from './modules/auth/auth.routes.js';
import userRouter from './modules/users/user.routes.js';
import communityRouter from './modules/communities/community.routes.js';
import { channelRouter } from './modules/channels/channel.routes.js';
import { channelInviteRouter } from './modules/channels/channel.invite.routes.js';
import { storyRouter } from './modules/stories/story.routes.js';
import groupRouter from './modules/groups/group.routes.js';
import messageRouter from './modules/messages/message.routes.js';
import { e2eeRouter } from './modules/e2ee/e2ee.routes.js';
import { groupKeyRouter } from './modules/e2ee/groupKey.routes.js';
import { recoveryBackupRouter } from './modules/e2ee/recoveryBackup.routes.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { buildRateLimitStore } from './middleware/rateLimitStore.js';

export function resolveTrustProxy(value: string): boolean | number | string {
  if (value === '' || value === 'false') return false;
  if (value === 'true') return true;
  const asNumber = Number(value);
  return Number.isInteger(asNumber) && String(asNumber) === value ? asNumber : value;
}

export function createApp(): Express {
  const app = express();

  // Off unless explicitly configured (see env.ts) — required for correct
  // client-IP rate limiting behind a proxy, unsafe to enable without one.
  app.set('trust proxy', resolveTrustProxy(env.TRUST_PROXY));

  app.use(helmet());
  app.use(
    cors({
      origin: env.CLIENT_URL,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(
    rateLimit({
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      max: env.RATE_LIMIT_MAX,
      standardHeaders: true,
      legacyHeaders: false,
      store: buildRateLimitStore(env.RATE_LIMIT_WINDOW_MS),
    }),
  );

  const authLimiter = rateLimit({
    windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
    max: env.AUTH_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    store: buildRateLimitStore(env.AUTH_RATE_LIMIT_WINDOW_MS),
  });

  const otpLimiter = rateLimit({
    windowMs: env.OTP_RATE_LIMIT_WINDOW_MS,
    max: env.OTP_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    store: buildRateLimitStore(env.OTP_RATE_LIMIT_WINDOW_MS),
  });

  const joinLimiter = rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    store: buildRateLimitStore(env.RATE_LIMIT_WINDOW_MS),
  });

  // Tighter than the general tier: a broadcast channel is a spam vector, so
  // post creation gets its own Redis-backed ceiling (channels-plan.md §5).
  const postLimiter = rateLimit({
    windowMs: env.CHANNEL_POST_RATE_LIMIT_WINDOW_MS,
    max: env.CHANNEL_POST_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    store: buildRateLimitStore(env.CHANNEL_POST_RATE_LIMIT_WINDOW_MS),
  });

  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

  const apiV1 = express.Router();
  apiV1.use(healthRouter);
  apiV1.use('/auth', authLimiter);
  apiV1.post('/auth/register', otpLimiter);
  apiV1.post('/auth/resend-otp', otpLimiter);
  apiV1.use('/auth', authRouter);
  apiV1.use('/users', userRouter);
  apiV1.use('/communities', communityRouter);
  // Unauthenticated invite preview first, then the rate-limited join/request
  // endpoints, then the authenticated channel router (which owns /:identifier).
  apiV1.use('/channels', channelInviteRouter);
  apiV1.post('/channels/invites/:token/join', authLimiter);
  apiV1.post('/channels/:identifier/requests', joinLimiter);
  apiV1.post('/channels/:identifier/posts', postLimiter);
  // Image uploads are a Cloudinary cost/spam vector too — same tighter tier.
  apiV1.post('/channels/:identifier/posts/:postId/images', postLimiter);
  apiV1.use('/channels', channelRouter);

  const storyLimiter = rateLimit({
    windowMs: env.STORY_RATE_LIMIT_WINDOW_MS,
    max: env.STORY_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    store: buildRateLimitStore(env.STORY_RATE_LIMIT_WINDOW_MS),
  });
  const storyViewLimiter = rateLimit({
    windowMs: env.STORY_VIEW_RATE_LIMIT_WINDOW_MS,
    max: env.STORY_VIEW_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    store: buildRateLimitStore(env.STORY_VIEW_RATE_LIMIT_WINDOW_MS),
  });
  // Stories are media (Cloudinary cost) + a spam vector — tighter than general.
  apiV1.post('/stories', storyLimiter);
  // Mark-viewed fires as the feed scrolls — its own lighter (higher) tier.
  apiV1.post('/stories/:storyId/views', storyViewLimiter);
  apiV1.use('/stories', storyRouter);
  apiV1.use('/groups', groupRouter);
  apiV1.use('/messages', messageRouter);
  apiV1.use('/e2ee/recovery', recoveryBackupRouter);
  apiV1.use('/e2ee', e2eeRouter);
  apiV1.use('/e2ee/groups', groupKeyRouter);
  app.use('/api/v1', apiV1);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
