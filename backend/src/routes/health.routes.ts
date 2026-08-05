import { Router, type Router as ExpressRouter } from 'express';
import { AppError } from '../errors/AppError.js';
import { searchProvider } from '../modules/search/typesense.js';
import { env } from '../config/env.js';

export const healthRouter: ExpressRouter = Router();

healthRouter.get('/health', async (_req, res) => {
  let search = 'disabled';
  if (env.TYPESENSE_ENABLED) {
    try {
      await searchProvider.ping();
      search = 'ok';
    } catch {
      search = 'unavailable';
    }
  }

  res.status(200).json({
    success: true,
    data: {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      dependencies: { search },
    },
  });
});

healthRouter.get('/error-test', () => {
  throw new AppError(418, 'TEAPOT', 'Demonstration of the centralized error handler');
});
