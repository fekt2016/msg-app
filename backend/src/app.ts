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
import groupRouter from './modules/groups/group.routes.js';
import messageRouter from './modules/messages/message.routes.js';
import { e2eeRouter } from './modules/e2ee/e2ee.routes.js';
import { groupKeyRouter } from './modules/e2ee/groupKey.routes.js';
import { recoveryBackupRouter } from './modules/e2ee/recoveryBackup.routes.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { buildRateLimitStore } from './middleware/rateLimitStore.js';

export function createApp(): Express {
  const app = express();

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

  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

  const apiV1 = express.Router();
  apiV1.use(healthRouter);
  apiV1.use('/auth', authLimiter);
  apiV1.post('/auth/register', otpLimiter);
  apiV1.post('/auth/resend-otp', otpLimiter);
  apiV1.use('/auth', authRouter);
  apiV1.use('/users', userRouter);
  apiV1.use('/communities', communityRouter);
  apiV1.use('/channels', channelRouter);
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
