import { db as defaultDb } from '../db/index';
import { targets, pings } from '../db/schema';

type DB = typeof defaultDb;

export async function pingAllTargets(db: DB = defaultDb): Promise<void> {
  const allTargets = db.select().from(targets).all();

  await Promise.allSettled(
    allTargets.map(async (target) => {
      const start = Date.now();
      let status: 'up' | 'down' = 'down';
      let latencyMs: number | null = null;

      try {
        await fetch(target.url, { signal: AbortSignal.timeout(5000) });
        status = 'up';
        latencyMs = Date.now() - start;
      } catch {
        // fetch threw (timeout, ECONNREFUSED, etc.) → status stays 'down'
      }

      db.insert(pings)
        .values({ targetId: target.id, status, latencyMs, pingedAt: Date.now() })
        .run();
    })
  );
}
