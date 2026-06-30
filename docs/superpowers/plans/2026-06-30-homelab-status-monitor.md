# HomeLab Status Monitor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-page homelab monitoring dashboard that pings HTTP targets every 30s, writes results to SQLite, and updates the UI via 5-second polling.

**Architecture:** Next.js 15 App Router (standalone output) with a background ping loop started in `instrumentation.ts`, a SQLite database managed by Drizzle ORM, and a Mantine v7 dark-themed dashboard that polls `/api/status` every 5 seconds.

**Tech Stack:** Next.js 15, React 19, Mantine UI v7, Drizzle ORM, better-sqlite3, Vitest, Docker (multi-stage Alpine build)

## Global Constraints

- Next.js 15 App Router only — no Pages Router patterns
- Mantine UI v7 only — no other component library
- Drizzle ORM + better-sqlite3 only — no Prisma, no other ORM
- SQLite file path: `/app/data/monitor.db` (via `DATABASE_URL` env var)
- `output: 'standalone'` in next.config.ts — required for Docker
- Probe method: HTTP GET to `host:port` only — no ICMP
- `instrumentation.ts` at project root — not inside `src/`
- Node.js 20 in Docker (Alpine)

---

## File Map

```
my-homelab-status/
├── .env.local                          # DATABASE_URL=./data/monitor.db (dev, gitignored)
├── .gitignore
├── .dockerignore
├── docker-compose.yml
├── Dockerfile
├── drizzle.config.ts                   # drizzle-kit config
├── instrumentation.ts                  # register() — starts ping loop on server boot
├── next.config.ts                      # output: standalone
├── package.json
├── postcss.config.cjs                  # required by Mantine v7 (must be .cjs in ESM projects)
├── tsconfig.json                       # standard Next.js (path alias @/ → src/)
├── vitest.config.ts
├── drizzle/                            # generated migration SQL (committed to git)
├── public/                             # empty, required by Next.js
├── data/                               # gitignored, holds monitor.db locally
└── src/
    ├── app/
    │   ├── layout.tsx                  # root layout: CSS import + MantineProvider (no separate wrapper needed)
    │   ├── page.tsx                    # dashboard — 'use client', polls /api/status
    │   └── api/
    │       ├── targets/
    │       │   ├── route.ts            # GET (list all), POST (add)
    │       │   └── [id]/
    │       │       └── route.ts        # DELETE (remove + cascade)
    │       └── status/
    │           └── route.ts            # GET — all targets + last 20 pings each
    ├── db/
    │   ├── schema.ts                   # Drizzle table definitions
    │   └── index.ts                    # DB singleton + runMigrations()
    └── lib/
        └── pinger.ts                   # pingAllTargets(db?) — testable via DI
        └── pinger.test.ts              # Vitest unit tests for pinger logic
```

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `next.config.ts`
- Create: `tsconfig.json`
- Create: `drizzle.config.ts`
- Create: `postcss.config.cjs`
- Create: `vitest.config.ts`
- Create: `.env.local`
- Create: `.gitignore`
- Create: `public/.gitkeep`
- Create: `data/.gitkeep`

**Interfaces:**
- Produces: runnable `npm run dev` and `npm test` commands

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "homelab-status-monitor",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate"
  },
  "dependencies": {
    "next": "15.3.3",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@mantine/core": "^7.17.4",
    "@mantine/hooks": "^7.17.4",
    "drizzle-orm": "^0.44.2",
    "better-sqlite3": "^11.10.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.13",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "drizzle-kit": "^0.31.1",
    "postcss-preset-mantine": "^1.17.0",
    "postcss-simple-vars": "^7.0.1",
    "typescript": "^5",
    "vitest": "^3.2.4"
  }
}
```

- [ ] **Step 2: Write `next.config.ts`**

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
};

export default nextConfig;
```

- [ ] **Step 3: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Write `drizzle.config.ts`**

```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? './data/monitor.db',
  },
});
```

- [ ] **Step 5: Write `postcss.config.cjs`**

Mantine v7 requires this file. Must be `.cjs` (not `.js`) in projects that have `"type": "module"` or Next.js 15 ESM conventions.

```js
module.exports = {
  plugins: {
    'postcss-preset-mantine': {},
    'postcss-simple-vars': {
      variables: {
        'mantine-breakpoint-xs': '36em',
        'mantine-breakpoint-sm': '48em',
        'mantine-breakpoint-md': '62em',
        'mantine-breakpoint-lg': '75em',
        'mantine-breakpoint-xl': '88em',
      },
    },
  },
};
```

- [ ] **Step 6: Write `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

- [ ] **Step 7: Write `.env.local`**

```
DATABASE_URL=./data/monitor.db
```

- [ ] **Step 8: Write `.gitignore`**

```
node_modules/
.next/
data/
.env.local
*.db
```

- [ ] **Step 9: Create empty required directories**

```bash
mkdir -p public data
touch public/.gitkeep data/.gitkeep
```

- [ ] **Step 10: Install dependencies**

```bash
npm install
```

Expected: `node_modules/` created, no errors. `better-sqlite3` compiles a native addon — this is normal and takes a few seconds.

- [ ] **Step 11: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no output (no errors). If you see "Cannot find module 'next'", run `npm install` again.

- [ ] **Step 12: Commit**

```bash
git init
git add package.json next.config.ts tsconfig.json drizzle.config.ts postcss.config.cjs vitest.config.ts .gitignore public/.gitkeep
git commit -m "feat: project scaffolding — Next.js 15 + Mantine v7 + Drizzle"
```

---

## Task 2: Database Schema & Migrations

**Files:**
- Create: `src/db/schema.ts`
- Create: `src/db/index.ts`
- Generates: `drizzle/` folder (migration SQL — commit after generating)

**Interfaces:**
- Produces: `db` (Drizzle client singleton), `runMigrations(): void`
- Produces: `targets` table ref, `pings` table ref (used by all API routes and pinger)

- [ ] **Step 1: Write `src/db/schema.ts`**

```ts
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
```

- [ ] **Step 2: Write `src/db/index.ts`**

```ts
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
```

- [ ] **Step 3: Generate migration files**

```bash
npm run db:generate
```

Expected output: something like:
```
No config path provided, using default 'drizzle.config.ts'
Reading config file '.../drizzle.config.ts'
1 tables
targets 4 columns 0 indexes 0 fks
pings 5 columns 0 indexes 1 fks
[✓] Your SQL migration file ➜ drizzle/0000_...sql
```

A `drizzle/` folder now exists with a `.sql` migration file and a `meta/` subfolder.

- [ ] **Step 4: Run migrations to verify they work locally**

```bash
node -e "
process.env.DATABASE_URL = './data/monitor.db';
const { runMigrations } = require('./src/db/index.ts');
" 
```

That won't work directly (TypeScript). Instead, verify via the dev server in Step 6 (instrumentation.ts will call runMigrations on boot). For now, just confirm the drizzle/ folder has content:

```bash
ls drizzle/
```

Expected: one `.sql` file and a `meta/` folder.

- [ ] **Step 5: Commit schema and migrations**

```bash
git add src/db/schema.ts src/db/index.ts drizzle/
git commit -m "feat: database schema (targets + pings) and Drizzle client"
```

---

## Task 3: Pinger Library

**Files:**
- Create: `src/lib/pinger.ts`
- Create: `src/lib/pinger.test.ts`

**Interfaces:**
- Consumes: `db` from `src/db/index.ts`, `targets` + `pings` from `src/db/schema.ts`
- Produces: `pingAllTargets(db?: DB): Promise<void>` — accepts optional db for testing

- [ ] **Step 1: Write the failing tests**

Create `src/lib/pinger.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test
```

Expected: 4 failing tests with "Cannot find module './pinger'" or similar.

- [ ] **Step 3: Write `src/lib/pinger.ts`**

```ts
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
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test
```

Expected: `4 passed` — no failures.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pinger.ts src/lib/pinger.test.ts
git commit -m "feat: pinger library with UP/DOWN HTTP probe and unit tests"
```

---

## Task 4: Targets API Routes (CRUD)

**Files:**
- Create: `src/app/api/targets/route.ts`
- Create: `src/app/api/targets/[id]/route.ts`

**Interfaces:**
- Consumes: `db` from `src/db/index.ts`, `targets` from `src/db/schema.ts`
- Produces:
  - `GET /api/targets` → `{ id, name, url, createdAt }[]`
  - `POST /api/targets` body `{ name: string, url: string }` → `{ id, name, url, createdAt }` (201)
  - `DELETE /api/targets/:id` → `{ ok: true }` (200)

- [ ] **Step 1: Write `src/app/api/targets/route.ts`**

```ts
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
```

- [ ] **Step 2: Write `src/app/api/targets/[id]/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { targets } from '@/db/schema';
import { eq } from 'drizzle-orm';

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
```

Note: In Next.js 15, dynamic route params are a `Promise` — they must be `await`ed.

- [ ] **Step 3: Start dev server and verify routes manually**

```bash
npm run dev
```

In a second terminal:

```bash
# Add a target
curl -s -X POST http://localhost:3000/api/targets \
  -H 'Content-Type: application/json' \
  -d '{"name":"Test","url":"http://localhost:3000"}' | jq

# Expected: {"id":1,"name":"Test","url":"http://localhost:3000","createdAt":...}

# List targets
curl -s http://localhost:3000/api/targets | jq

# Expected: [{"id":1,"name":"Test",...}]

# Delete the target
curl -s -X DELETE http://localhost:3000/api/targets/1 | jq

# Expected: {"ok":true}

# Confirm it's gone
curl -s http://localhost:3000/api/targets | jq

# Expected: []
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/targets/
git commit -m "feat: targets CRUD API (GET list, POST add, DELETE remove)"
```

---

## Task 5: Status API Route

**Files:**
- Create: `src/app/api/status/route.ts`

**Interfaces:**
- Consumes: `db`, `targets`, `pings` from `src/db/`
- Produces: `GET /api/status` →
  ```ts
  {
    targets: {
      id: number;
      name: string;
      url: string;
      currentStatus: 'up' | 'down' | null;
      latencyMs: number | null;
      uptimePercent: number | null;
      recentPings: { status: string; latencyMs: number | null; pingedAt: number }[];
    }[]
  }
  ```

- [ ] **Step 1: Write `src/app/api/status/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { db } from '@/db/index';
import { targets, pings } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';

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
```

- [ ] **Step 2: Verify the route with dev server running**

Add a target first (if not already), then:

```bash
curl -s http://localhost:3000/api/status | jq
```

Expected (before any pings have run):
```json
{
  "targets": [{
    "id": 1,
    "name": "Test",
    "url": "http://localhost:3000",
    "currentStatus": null,
    "latencyMs": null,
    "uptimePercent": null,
    "recentPings": []
  }]
}
```

After instrumentation.ts is wired up (Task 6), `recentPings` will populate within 30 seconds.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/status/route.ts
git commit -m "feat: status API — targets with last 20 pings and uptime percent"
```

---

## Task 6: Instrumentation (Background Ping Loop)

**Files:**
- Create: `instrumentation.ts` (project root — NOT inside src/)

**Interfaces:**
- Consumes: `runMigrations` from `src/db/index.ts`, `pingAllTargets` from `src/lib/pinger.ts`
- Produces: ping loop running every 30s after server boot

- [ ] **Step 1: Write `instrumentation.ts`**

```ts
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { runMigrations } = await import('./src/db/index');
    runMigrations();

    const { pingAllTargets } = await import('./src/lib/pinger');
    await pingAllTargets();
    setInterval(pingAllTargets, 30_000);
  }
}
```

The `NEXT_RUNTIME === 'nodejs'` guard prevents this from running in the Edge runtime. The `await pingAllTargets()` on boot ensures the first ping happens immediately (before the 30s interval fires).

- [ ] **Step 2: Verify the ping loop starts on dev server boot**

Restart the dev server:

```bash
# Stop the running server (Ctrl+C), then:
npm run dev
```

Watch the terminal. Within a few seconds of startup you should see no errors. Add a target via curl, then wait 30 seconds. Query status:

```bash
curl -s http://localhost:3000/api/status | jq '.targets[0].recentPings | length'
```

Expected: `1` (after first ping), `2` (after second ping 30s later).

Also verify the SQLite file was created:

```bash
ls -la data/
```

Expected: `monitor.db` present and non-zero size.

- [ ] **Step 3: Commit**

```bash
git add instrumentation.ts
git commit -m "feat: instrumentation.ts — starts ping loop and migrations on server boot"
```

---

## Task 7: Dashboard UI

**Files:**
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`

**Interfaces:**
- Consumes: `GET /api/status` (polled every 5s), `POST /api/targets`, `DELETE /api/targets/:id`
- Produces: fully interactive dashboard at `http://localhost:3000`

- [ ] **Step 1: Write `src/app/layout.tsx`**

`MantineProvider` handles its own client boundary — no separate `providers.tsx` wrapper needed. `mantineHtmlProps` spreads a `data-mantine-color-scheme` attribute on `<html>` that Mantine requires to avoid flash-of-wrong-theme.

```tsx
import '@mantine/core/styles.css';
import { ColorSchemeScript, MantineProvider, mantineHtmlProps, createTheme } from '@mantine/core';
import type { Metadata } from 'next';

const theme = createTheme({
  fontFamily: 'monospace',
  primaryColor: 'green',
  defaultRadius: 'sm',
});

export const metadata: Metadata = {
  title: 'HomeLab Status Monitor',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" {...mantineHtmlProps}>
      <head>
        <ColorSchemeScript defaultColorScheme="dark" />
      </head>
      <body style={{ backgroundColor: '#0a0a0a', margin: 0 }}>
        <MantineProvider theme={theme} defaultColorScheme="dark">
          {children}
        </MantineProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Write `src/app/page.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Card,
  Container,
  Group,
  Modal,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';

interface PingRecord {
  status: 'up' | 'down';
  latencyMs: number | null;
  pingedAt: number;
}

interface TargetStatus {
  id: number;
  name: string;
  url: string;
  currentStatus: 'up' | 'down' | null;
  latencyMs: number | null;
  uptimePercent: number | null;
  recentPings: PingRecord[];
}

interface StatusData {
  targets: TargetStatus[];
}

export default function Dashboard() {
  const [data, setData] = useState<StatusData>({ targets: [] });
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [opened, { open, close }] = useDisclosure(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const load = () =>
      fetch('/api/status')
        .then((r) => r.json())
        .then((d: StatusData) => {
          setData(d);
          setLastUpdated(new Date().toLocaleTimeString());
        })
        .catch(console.error);

    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []);

  async function handleAdd() {
    if (!name.trim() || !url.trim()) return;
    setAdding(true);
    await fetch('/api/targets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), url: url.trim() }),
    });
    setName('');
    setUrl('');
    setAdding(false);
    close();
  }

  async function handleDelete(id: number) {
    await fetch(`/api/targets/${id}`, { method: 'DELETE' });
    setData((d) => ({ targets: d.targets.filter((t) => t.id !== id) }));
  }

  return (
    <Container size="xl" py="md">
      {/* Header */}
      <Group justify="space-between" mb="xl">
        <Group>
          <Text c="green" fw={700} size="xl">▮</Text>
          <Title order={1} c="green" size="h3" style={{ letterSpacing: 2 }}>
            HOMELAB STATUS MONITOR
          </Title>
        </Group>
        <Group>
          {lastUpdated && (
            <Text size="xs" c="dimmed">LAST SYNC: {lastUpdated}</Text>
          )}
          <Button onClick={open} variant="outline" color="green" size="xs">
            + ADD TARGET
          </Button>
        </Group>
      </Group>

      {/* Target cards */}
      {data.targets.length === 0 ? (
        <Text c="dimmed" ta="center" mt="xl">
          NO TARGETS. CLICK "+ ADD TARGET" TO BEGIN MONITORING.
        </Text>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
          {data.targets.map((target) => (
            <TargetCard key={target.id} target={target} onDelete={handleDelete} />
          ))}
        </SimpleGrid>
      )}

      {/* Add target modal */}
      <Modal
        opened={opened}
        onClose={close}
        title="ADD MONITORING TARGET"
        centered
        styles={{
          title: { fontFamily: 'monospace', color: 'var(--mantine-color-green-6)', fontWeight: 700 },
          content: { backgroundColor: '#111', border: '1px solid #333' },
          header: { backgroundColor: '#111' },
        }}
      >
        <Stack>
          <TextInput
            label="Name"
            placeholder="Home Router"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <TextInput
            label="URL"
            placeholder="http://192.168.1.1:80"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
          <Button onClick={handleAdd} color="green" loading={adding}>
            ADD
          </Button>
        </Stack>
      </Modal>
    </Container>
  );
}

function TargetCard({
  target,
  onDelete,
}: {
  target: TargetStatus;
  onDelete: (id: number) => void;
}) {
  const isUp = target.currentStatus === 'up';
  const isDown = target.currentStatus === 'down';
  const borderColor = isUp ? '#39ff14' : isDown ? '#ff4444' : '#444';

  // Reverse for chronological display (oldest left → newest right)
  const chronological = [...target.recentPings].reverse();

  return (
    <Card
      withBorder
      p="md"
      style={{ borderColor, backgroundColor: '#0f0f0f' }}
    >
      {/* Title row */}
      <Group justify="space-between" mb={4}>
        <Text fw={700} c="white" size="sm" style={{ letterSpacing: 1 }}>
          {target.name}
        </Text>
        <Group gap={6}>
          {target.currentStatus ? (
            <Badge
              color={isUp ? 'green' : 'red'}
              variant="filled"
              size="sm"
              style={{ letterSpacing: 1 }}
            >
              {target.currentStatus.toUpperCase()}
            </Badge>
          ) : (
            <Badge color="gray" variant="outline" size="sm">PENDING</Badge>
          )}
          <ActionIcon
            variant="subtle"
            color="red"
            size="sm"
            onClick={() => onDelete(target.id)}
            title="Remove target"
          >
            ✕
          </ActionIcon>
        </Group>
      </Group>

      {/* URL */}
      <Text size="xs" c="dimmed" mb="xs" style={{ wordBreak: 'break-all' }}>
        {target.url}
      </Text>

      {/* Stats */}
      <Group mb="xs" gap="lg">
        <Text size="sm" c={isUp ? 'green' : 'dimmed'} fw={600}>
          {target.latencyMs !== null ? `${target.latencyMs}ms` : '--'}
        </Text>
        {target.uptimePercent !== null && (
          <Text size="sm" c="dimmed">
            {target.uptimePercent}% UP
          </Text>
        )}
      </Group>

      {/* Ping history strip */}
      <Group gap={3} wrap="nowrap">
        {chronological.length === 0 ? (
          <Text size="xs" c="dimmed">WAITING FOR FIRST PING...</Text>
        ) : (
          chronological.map((ping, i) => (
            <Tooltip
              key={i}
              label={`${ping.status.toUpperCase()} ${ping.latencyMs !== null ? `${ping.latencyMs}ms` : ''} @ ${new Date(ping.pingedAt).toLocaleTimeString()}`}
              position="top"
              withArrow
            >
              <Box
                style={{
                  width: 10,
                  height: 20,
                  backgroundColor: ping.status === 'up' ? '#39ff14' : '#ff4444',
                  borderRadius: 2,
                  flexShrink: 0,
                  cursor: 'default',
                }}
              />
            </Tooltip>
          ))
        )}
      </Group>
    </Card>
  );
}
```

- [ ] **Step 3: Verify the dashboard works**

With the dev server running and at least one target added:

1. Open `http://localhost:3000` in a browser
2. You should see the dark terminal-themed dashboard
3. After 30s, ping history bars appear on each card
4. Click "+ ADD TARGET", add `http://localhost:3000`, click ADD — new card appears
5. Watch the bars fill in over the next minute
6. To test DOWN detection: add a target pointing at a non-existent host (e.g., `http://192.168.1.250:9999`), wait 30s — card should show red DOWN badge

- [ ] **Step 4: Commit**

```bash
git add src/app/layout.tsx src/app/page.tsx
git commit -m "feat: Mantine v7 dark terminal dashboard with 5s polling and ping history"
```

---

## Task 8: Docker Build & Compose

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Create: `.dockerignore`

**Interfaces:**
- Consumes: all built project files
- Produces: `docker-compose up --build` starts the app at `http://localhost:3000` with SQLite persisted at `./data/monitor.db` on the host

- [ ] **Step 1: Write `.dockerignore`**

```
node_modules
.next
data
.env*
*.db
.git
```

- [ ] **Step 2: Write `Dockerfile`**

```dockerfile
# Stage 1: Install dependencies (includes native addon compilation)
FROM node:20-alpine AS deps
WORKDIR /app

# Required to compile better-sqlite3 native addon on Alpine
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci

# Stage 2: Build Next.js standalone bundle
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
# Placeholder: build needs DATABASE_URL set to any value for env validation
ENV DATABASE_URL=/app/data/monitor.db

RUN npm run build

# Stage 3: Minimal production image
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Non-root user for security
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# Create data dir with correct ownership for SQLite file
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data

# Copy standalone build output
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Copy migration files — runMigrations() reads these at runtime
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
```

- [ ] **Step 3: Write `docker-compose.yml`**

```yaml
services:
  monitor:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data
    environment:
      - DATABASE_URL=/app/data/monitor.db
      - NODE_ENV=production
    restart: unless-stopped
```

The `./data:/app/data` volume means `monitor.db` lives on the LXC host filesystem — it survives `docker-compose down` and container rebuilds.

- [ ] **Step 4: Build and run**

```bash
docker-compose up --build
```

First build takes ~3-5 minutes (compiling better-sqlite3 on Alpine). Subsequent builds are fast due to layer caching.

Expected output ends with something like:
```
monitor-1  | ▶ Local: http://0.0.0.0:3000
monitor-1  |   ○ Starting...
monitor-1  |   ✓ Ready in 847ms
```

- [ ] **Step 5: Verify end-to-end in Docker**

```bash
# From the LXC host, add a target
curl -s -X POST http://localhost:3000/api/targets \
  -H 'Content-Type: application/json' \
  -d '{"name":"Google","url":"https://google.com"}' | jq

# Check status (run a few times over 60s to see pings accumulate)
curl -s http://localhost:3000/api/status | jq '.targets[0] | {name, currentStatus, latencyMs, uptimePercent}'

# Verify SQLite file was written to the host volume
ls -lh ./data/monitor.db
```

Expected: `monitor.db` exists and grows as pings are recorded.

- [ ] **Step 6: Test container restart persistence**

```bash
docker-compose restart monitor
sleep 10
curl -s http://localhost:3000/api/status | jq '.targets[0].recentPings | length'
```

Expected: previous pings are still there (SQLite on host volume survived restart).

- [ ] **Step 7: Commit**

```bash
git add Dockerfile docker-compose.yml .dockerignore
git commit -m "feat: Docker multi-stage build with SQLite volume persistence"
```

---

## Done

At this point:
- `docker-compose up --build` starts the full stack
- `http://localhost:3000` shows the Mantine dark dashboard
- Ping loop fires every 30s and writes to `./data/monitor.db` on the host
- Dashboard auto-refreshes every 5s
- Turning off an LXC container causes its card to go red within ~35s (30s interval + 5s poll)
- `docker-compose down && docker-compose up` preserves all data
