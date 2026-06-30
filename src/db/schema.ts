import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const targets = sqliteTable('targets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  url: text('url').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const pings = sqliteTable('pings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  targetId: integer('target_id')
    .notNull()
    .references(() => targets.id, { onDelete: 'cascade' }),
  status: text('status', { enum: ['up', 'down'] }).notNull(),
  latencyMs: integer('latency_ms'),
  pingedAt: integer('pinged_at').notNull(),
});
