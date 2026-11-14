import express, { type Express } from 'express';
import { registerApiRoutes } from './routes.js';
import { db } from './store.js';

export function createApp(): Express {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.use(async (_req, _res, next) => {
    try {
      await db.hydrate();
    } catch (err) {
      console.error('[vayucare] State hydration failed:', err);
    }
    next();
  });

  registerApiRoutes(app);
  return app;
}
