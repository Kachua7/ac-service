import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp } from '../server/app.js';

const app = createApp();

export default function handler(req: IncomingMessage, res: ServerResponse) {
  const rawUrl = req.url ?? '/';
  const parsed = new URL(rawUrl, 'http://localhost');
  const rewrittenPath = parsed.searchParams.get('__vpath');
  if (rewrittenPath !== null) {
    parsed.searchParams.delete('__vpath');
    const qs = parsed.searchParams.toString();
    req.url = `/api/${rewrittenPath}${qs ? `?${qs}` : ''}`;
  }
  return app(req as Parameters<typeof app>[0], res as Parameters<typeof app>[1]);
}
