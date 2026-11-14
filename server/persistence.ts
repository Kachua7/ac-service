import fs from 'node:fs';
import path from 'node:path';

/**
 * Snapshot persistence backends for VayuCare JSON state:
 * - `redis`: Upstash / Vercel KV REST API (survives cold starts across serverless instances).
 * - `file`: Local filesystem (`data/vayucare-db.json`) for local dev and Node containers.
 * - `memory`: Safe fallback on Vercel when KV/Redis env vars are not configured.
 */
export interface SnapshotBackend {
  readonly kind: 'redis' | 'file' | 'memory';
  loadSync?(): string | null;
  load(): Promise<string | null>;
  save(payload: string): Promise<void>;
}

const SNAPSHOT_KEY = 'vayucare:state:v1';
const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'vayucare-db.json');

function readRedisConfig(): { url: string; token: string } | null {
  const rawUrl = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL ?? '';
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN ?? '';
  const url = rawUrl.replace(/\/+$/, '');
  if (!url || !token) return null;
  return { url, token };
}

function createRedisBackend(config: { url: string; token: string }): SnapshotBackend {
  const headers = {
    Authorization: `Bearer ${config.token}`,
    'Content-Type': 'application/json',
  };

  return {
    kind: 'redis',
    async load() {
      const res = await fetch(`${config.url}/get/${encodeURIComponent(SNAPSHOT_KEY)}`, { headers });
      if (!res.ok) throw new Error(`Snapshot read failed (${res.status})`);
      const body = (await res.json()) as { result?: string | null };
      return typeof body.result === 'string' ? body.result : null;
    },
    async save(payload: string) {
      const res = await fetch(config.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(['SET', SNAPSHOT_KEY, payload]),
      });
      if (!res.ok) throw new Error(`Snapshot write failed (${res.status})`);
    },
  };
}

function createFileBackend(): SnapshotBackend {
  const readSnapshot = () => {
    try {
      if (!fs.existsSync(DB_FILE)) return null;
      return fs.readFileSync(DB_FILE, 'utf-8');
    } catch (err) {
      console.error('[vayucare] Failed to read DB file:', err);
      return null;
    }
  };

  return {
    kind: 'file',
    loadSync: readSnapshot,
    async load() {
      return readSnapshot();
    },
    async save(payload: string) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const tempFile = `${DB_FILE}.tmp`;
      fs.writeFileSync(tempFile, payload, 'utf-8');
      fs.renameSync(tempFile, DB_FILE);
    },
  };
}

function createMemoryBackend(): SnapshotBackend {
  return {
    kind: 'memory',
    async load() {
      return null;
    },
    async save() {
      // Ephemeral per-instance memory when running on Vercel without KV/Redis.
    },
  };
}

export function createSnapshotBackend(): SnapshotBackend {
  const redis = readRedisConfig();
  if (redis) return createRedisBackend(redis);
  if (!process.env.VERCEL) return createFileBackend();
  return createMemoryBackend();
}
