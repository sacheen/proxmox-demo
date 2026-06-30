import { NextResponse } from 'next/server';
import { db } from '@/db/index';
import { targets, pings } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET() {
  const allTargets = db.select().from(targets).all();

  const result = allTargets.map((target) => {
    const recentPings = db
      .select()
      .from(pings)
      .where(eq(pings.targetId, target.id))
      .orderBy(desc(pings.pingedAt))
      .limit(20)
      .all();

    const upCount = recentPings.filter((p) => p.status === 'up').length;
    const uptimePercent =
      recentPings.length > 0
        ? Math.round((upCount / recentPings.length) * 1000) / 10
        : null;

    const latest = recentPings[0] ?? null;

    return {
      id: target.id,
      name: target.name,
      url: target.url,
      currentStatus: latest?.status ?? null,
      latencyMs: latest?.latencyMs ?? null,
      uptimePercent,
      recentPings,
    };
  });

  return NextResponse.json({ targets: result });
}
