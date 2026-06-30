import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import path from 'path';
import * as schema from '../db/schema';
import { targets, pings } from '../db/schema';

// Helper: create a fresh in-memory DB with migrations applied
function createTestDb() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const testDb = drizzle(sqlite, { schema });
  migrate(testDb, { migrationsFolder: path.join(process.cwd(), 'drizzle') });
  return testDb;
}

type TestDb = ReturnType<typeof createTestDb>;

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

describe('pingAllTargets', () => {
  it('inserts an UP ping with latency when fetch resolves', async () => {
    const { pingAllTargets } = await import('./pinger');
    const testDb = createTestDb();

    testDb
      .insert(targets)
      .values({ name: 'Router', url: 'http://192.168.1.1:80', createdAt: Date.now() })
      .run();

    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 200 }));

    await pingAllTargets(testDb as unknown as TestDb);

    const rows = testDb.select().from(pings).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('up');
    expect(rows[0].latencyMs).toBeGreaterThanOrEqual(0);
    expect(rows[0].latencyMs).toBeLessThan(1000);
  });

  it('inserts a DOWN ping with null latency when fetch throws', async () => {
    const { pingAllTargets } = await import('./pinger');
    const testDb = createTestDb();

    testDb
      .insert(targets)
      .values({ name: 'Broken', url: 'http://10.0.0.99:8080', createdAt: Date.now() })
      .run();

    vi.mocked(fetch).mockRejectedValueOnce(new Error('ECONNREFUSED'));

    await pingAllTargets(testDb as unknown as TestDb);

    const rows = testDb.select().from(pings).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('down');
    expect(rows[0].latencyMs).toBeNull();
  });

  it('pings all targets in parallel — one UP one DOWN', async () => {
    const { pingAllTargets } = await import('./pinger');
    const testDb = createTestDb();

    testDb
      .insert(targets)
      .values([
        { name: 'A', url: 'http://host-a:80', createdAt: Date.now() },
        { name: 'B', url: 'http://host-b:80', createdAt: Date.now() },
      ])
      .run();

    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(null, { status: 404 })) // A: UP (any HTTP response = up)
      .mockRejectedValueOnce(new Error('timeout'));               // B: DOWN

    await pingAllTargets(testDb as unknown as TestDb);

    const rows = testDb.select().from(pings).all();
    expect(rows).toHaveLength(2);
    const statuses = rows.map((r) => r.status).sort();
    expect(statuses).toEqual(['down', 'up']);
  });

  it('does nothing when there are no targets', async () => {
    const { pingAllTargets } = await import('./pinger');
    const testDb = createTestDb();

    await pingAllTargets(testDb as unknown as TestDb);

    const rows = testDb.select().from(pings).all();
    expect(rows).toHaveLength(0);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});
