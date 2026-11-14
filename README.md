# VayuCare — AC Service Marketplace

A full-stack AC service booking and operations app for Jaipur/Rajasthan. It includes a customer booking flow, technician portal, live job tracking, quote approvals, and an admin dispatch dashboard.

## Stack

- React 19, TypeScript, Vite 8, Tailwind CSS 4
- Express 4 API, run locally by `tsx` and as a single Vercel Function in production
- File-backed JSON store locally, Redis snapshot store when configured
- Bun lockfile (`bun.lock`) for reproducible dependency installation

## Requirements

- Node.js 22 or newer
- Bun (for installing dependencies from the committed lockfile)

## Run locally

```bash
git clone https://github.com/Kachua7/ac-service.git
cd ac-service
cp .env.example .env
bun install --frozen-lockfile
bun run dev
```

Open [http://localhost:3000](http://localhost:3000). The server serves the Vite app and the API endpoints from the same process. Set `PORT` in `.env` to use a different port.

### Local demo access

The development-only demo accounts are seeded for exploring the UI:

- Customer: use the prefilled demo customer details (the seeded number is a non-routable placeholder).
- Technician: use a seeded technician profile and passcode `tech-demo-only`.
- Admin: `ops@example.test` / `admin-demo-only`.

These demo credentials are not suitable for deployment or real users. In production, the server does not enable fallback admin/technician credentials. Configure `ADMIN_EMAIL`, `ADMIN_PASSCODE`, and `TECH_PASSCODE` as strong secrets in the hosting platform.

## Commands

```bash
bun run dev       # Start the development server
bun run test      # Run server-side tests
bun run lint      # Type-check the project
bun run build     # Build the production frontend
NODE_ENV=production bun run start  # Serve the production build
```

For production, run `bun run build` before starting the server with `NODE_ENV=production`. The application expects the generated `dist/` directory to be present.

## Deploy on Vercel

The Vite client is built into `dist/`, and the Express API runs as a single Vercel Function from `api/index.ts`. `vercel.json` already sets the build command, the output directory, and the `/api/*` rewrite.

1. Import the repository at [vercel.com/new](https://vercel.com/new).
2. Add these environment variables (Project → Settings → Environment Variables):
   - `SESSION_SECRET` — long random string used to sign portal session tokens.
   - `ADMIN_EMAIL`, `ADMIN_PASSCODE`, `TECH_PASSCODE` — required for admin and technician sign-in in production, which Vercel sets automatically. Without them the site stays usable for customers, but admin and technician sign-in returns 503 rather than falling back to the demo credentials.
   - `KV_REST_API_URL` and `KV_REST_API_TOKEN` — from an Upstash Redis / Vercel KV marketplace integration. Optional, but without them each function instance keeps bookings in memory and reseeds on a cold start.
3. Redeploy.

Realtime updates (technician location, new bookings, chat) are delivered by polling `GET /api/realtime/events?since=<seq>` every two seconds, because a serverless function cannot hold a WebSocket open.

## Data and security notes

- `data/*.json` is runtime data and is intentionally ignored by Git. A fresh local run generates demo seed data. Do not commit a live database snapshot.
- Never commit `.env` files, API keys, real customer/technician records, addresses, identity documents, or location history.
- The included JSON store is suitable for a local prototype/demo only. Use a managed database with backups, access controls, migrations, and retention policies before handling real customer data.
- The demo authentication is not production-grade identity verification. Add OTP/identity-provider authentication, rate limiting, secure session handling, CSRF protections where applicable, and audited authorization before public launch.

## Repository checks

GitHub Actions runs tests, TypeScript checks, and a production frontend build on pushes and pull requests to `main`.
