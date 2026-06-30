import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import path from 'path';
import fs from 'fs';
import * as schema from './schema';

const DB_PATH = process.env.DATABASE_URL ?? path.join(process.cwd(), 'data', 'monitor.db');

function createDb() {
  const dir = path.dirname(path.resolve(DB_PATH));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const sqlite = new Database(DB_PATH);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  return drizzle(sqlite, { schema });
}

// Singleton: prevents multiple connections during Next.js dev hot-reload
const globalForDb = globalThis as unknown as { db: ReturnType<typeof createDb> };
export const db = globalForDb.db ?? createDb();
if (process.env.NODE_ENV !== 'production') globalForDb.db = db;

export function runMigrations(): void {
  const migrationsFolder = path.join(process.cwd(), 'drizzle');
  migrate(db, { migrationsFolder });
}
