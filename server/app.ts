import express, { type Express } from 'express';
import { registerApiRoutes } from './routes';
import { db } from './store';

/**
 * Builds the API application without any local-dev concerns (no Vite
 * middleware, no listening socket), so the same code runs under `tsx` locally
 * and inside a Vercel serverless function.
 */
export function createApp(): Express {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // Pull the latest persisted snapshot before handling the request. On hosts
  // with local state (dev, containers) this is a no-op.
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
