import fs from 'node:fs';
import path from 'node:path';

/**
 * Snapshot persistence backends for the VayuCare JSON state.
 *
 * - `redis`: Upstash-compatible REST Redis (Vercel KV / Upstash marketplace
 *   integration). Works from serverless functions because it is a plain HTTPS
 *   call, so a snapshot survives cold starts and is shared by every instance.
 * - `file`: local development / long-running Node hosts, writing data/vayucare-db.json.
 * - `memory`: last-resort fallback (e.g. Vercel without a KV integration), where
 *   state lives for the lifetime of one warm function instance only.
 */
export interface SnapshotBackend {
  readonly kind: 'redis' | 'file' | 'memory';
  /** Synchronous bootstrap used by long-running Node hosts. */
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
      // No durable target configured; the in-memory state is all we keep.
    },
  };
}

export function createSnapshotBackend(): SnapshotBackend {
  const redis = readRedisConfig();
  if (redis) return createRedisBackend(redis);
  // Serverless filesystems are read-only/ephemeral, so skip the file backend there.
  if (!process.env.VERCEL) return createFileBackend();
  return createMemoryBackend();
}

export const SNAPSHOT_BACKEND_HINT =
  'Connect an Upstash Redis / Vercel KV integration and set KV_REST_API_URL and KV_REST_API_TOKEN to persist VayuCare data on Vercel.';
