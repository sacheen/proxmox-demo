import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { targets } from '@/db/schema';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const numericId = parseInt(id, 10);

  if (isNaN(numericId)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  db.delete(targets).where(eq(targets.id, numericId)).run();
  return NextResponse.json({ ok: true });
}
