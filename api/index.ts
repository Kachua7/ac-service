import { createApp } from '../server/app';

/**
 * Vercel entry point.
 *
 * `vercel.json` rewrites every `/api/*` request to this single function, and
 * Express still receives the original URL, so the existing route table keeps
 * working unchanged.
 */
export default createApp();
