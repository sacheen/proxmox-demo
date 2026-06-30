import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { targets } from '@/db/schema';

export async function GET() {
  const rows = db.select().from(targets).all();
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const name = (body?.name ?? '').trim();
  const url = (body?.url ?? '').trim();

  if (!name || !url) {
    return NextResponse.json({ error: 'name and url are required' }, { status: 400 });
  }

  const row = db
    .insert(targets)
    .values({ name, url, createdAt: Date.now() })
    .returning()
    .get();

  return NextResponse.json(row, { status: 201 });
}
