import mongoose from 'mongoose';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { logInfrastructureMode } from './config/infrastructure.js';
import { createApp } from './app.js';
import { createRealtimeServer } from './realtime/server.js';

async function bootstrap(): Promise<void> {
  // One clear summary of the active infrastructure mode, before any connections.
  logInfrastructureMode({
    nodeEnv: env.NODE_ENV,
    redisEnabled: env.REDIS_ENABLED,
    typesenseEnabled: env.TYPESENSE_ENABLED,
  });

  const app = createApp();

  await mongoose.connect(env.MONGODB_URL);
  logger.info('Connected to MongoDB');

  const server = app.listen(env.APP_PORT, () => {
    logger.info(`${env.APP_NAME} listening on ${env.APP_URL}`);
  });

  const realtime = await createRealtimeServer(server);
  logger.info('Socket.IO realtime server attached');

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`${signal} received, shutting down`);
    await realtime.close();
    server.close(async () => {
      await mongoose.disconnect();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

bootstrap().catch((err: unknown) => {
  logger.error({ err }, 'Failed to start server');
  process.exit(1);
});
