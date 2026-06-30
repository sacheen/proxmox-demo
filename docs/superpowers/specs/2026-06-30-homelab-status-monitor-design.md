# Geeky HomeLab Status Monitor — Design Spec

**Date:** 2026-06-30  
**Status:** Approved

---

## Overview

A single-dashboard Next.js 15 web application that monitors HTTP reachability of homelab targets (websites and Proxmox LXC containers). Runs fully inside Docker, deployed inside its own Proxmox LXC container. Proves the infrastructure writes to disk and processes data in real time.

---

## Non-Negotiable Constraints

| Constraint | Decision |
|---|---|
| Framework | Next.js 15, App Router |
| UI | Mantine UI v7, dark/terminal theme |
| Database | SQLite via Drizzle ORM (`/app/data/monitor.db`) |
| ORM | Drizzle only — Prisma forbidden |
| Containerization | Docker multi-stage standalone build |
| Probe method | HTTP GET to `host:port` — no ICMP, no privilege escalation |
| Deployment context | Docker inside a Proxmox LXC container |

---

## Architecture

```
instrumentation.ts (server start, nodejs runtime only)
  └─ setInterval(pingAllTargets, 30_000ms)
        └─ fetch(target.url, AbortController timeout: 5s)
              └─ insert ping row → SQLite via Drizzle

Browser
  └─ useEffect setInterval(fetch('/api/status'), 5_000ms)
        └─ update React state → re-render cards
```

Single Next.js process. No sidecar containers. No external scheduler.

---

## File Structure

```
my-homelab-status/
├── docs/superpowers/specs/       # This file
├── drizzle/                      # Drizzle migration files (auto-generated)
├── src/
│   ├── app/
│   │   ├── page.tsx              # Main dashboard (client component)
│   │   └── api/
│   │       ├── targets/
│   │       │   ├── route.ts      # GET (list), POST (add)
│   │       │   └── [id]/
│   │       │       └── route.ts  # DELETE (remove + cascade)
│   │       └── status/
│   │           └── route.ts      # GET — polled every 5s by dashboard
│   ├── db/
│   │   ├── schema.ts             # Drizzle table definitions
│   │   └── index.ts              # DB client singleton
│   └── lib/
│       └── pinger.ts             # pingAllTargets() function
├── instrumentation.ts            # register() — starts ping loop on server boot
├── next.config.ts                # output: 'standalone'
├── Dockerfile                    # 3-stage: deps → builder → runner
├── docker-compose.yml            # Volume mount + port 3000
└── package.json
```

---

## Data Model

### `targets`

| column | type | constraints |
|---|---|---|
| `id` | integer | PK, auto-increment |
| `name` | text | NOT NULL — display label |
| `url` | text | NOT NULL — full URL e.g. `http://192.168.1.50:8080` |
| `created_at` | integer | Unix timestamp (ms) |

### `pings`

| column | type | constraints |
|---|---|---|
| `id` | integer | PK, auto-increment |
| `target_id` | integer | FK → `targets.id`, ON DELETE CASCADE |
| `status` | text | `'up'` or `'down'` |
| `latency_ms` | integer | nullable — null when status is `'down'` |
| `pinged_at` | integer | Unix timestamp (ms) |

Cascade delete: removing a target automatically removes all its ping history.

---

## API Routes

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/targets` | List all targets |
| `POST` | `/api/targets` | Add target `{ name: string, url: string }` |
| `DELETE` | `/api/targets/[id]` | Remove target and all its pings |
| `GET` | `/api/status` | All targets with last 20 pings each (polled every 5s) |

### `/api/status` Response Shape

```json
{
  "targets": [
    {
      "id": 1,
      "name": "Home Router",
      "url": "http://192.168.1.1:80",
      "currentStatus": "up",
      "latencyMs": 12,
      "uptimePercent": 95.0,
      "recentPings": [
        { "status": "up", "latencyMs": 12, "pingedAt": 1234567890 }
      ]
    }
  ]
}
```

`uptimePercent` = `(up pings / total pings in last 20) * 100`, rounded to one decimal.  
`currentStatus` = status of the most recent ping row.  
`latencyMs` = latency of the most recent ping (null if down).

---

## Background Pinger

**`instrumentation.ts`** (project root)

```ts
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { runMigrations } = await import('./src/db/index')
    await runMigrations()                          // ensure tables exist before first ping
    const { pingAllTargets } = await import('./src/lib/pinger')
    await pingAllTargets()
    setInterval(pingAllTargets, 30_000)
  }
}
```

`runMigrations()` calls `drizzle-kit`'s `migrate()` helper pointing at the `drizzle/` folder. This is safe to call on every boot — it's a no-op if tables already exist. The `/app/data` directory must exist before this runs; the Dockerfile `runner` stage creates it with `mkdir -p /app/data`.

**`src/lib/pinger.ts` — `pingAllTargets()`**

1. Query all rows from `targets`
2. For each target, in parallel (`Promise.allSettled`):
   - Record `start = Date.now()`
   - `fetch(target.url, { signal: AbortSignal.timeout(5000) })`
   - If response received (any HTTP status) → status `'up'`, latency = `Date.now() - start`
   - If fetch throws or times out → status `'down'`, latency `null`
3. Insert one `pings` row per target

"Any HTTP status = UP" is intentional: a 404 from a running LXC still proves the container is alive.

---

## Dashboard UI

**Theme:** Mantine v7 `MantineProvider` with `colorScheme: 'dark'`, `fontFamily: 'monospace'`, primary color neon green (`#39ff14`), background `#0a0a0a`.

**Layout:**

```
┌─────────────────────────────────────────────┐
│  ▮ HOMELAB STATUS MONITOR          [+ ADD]  │
├─────────────────────────────────────────────┤
│  ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│  │ Router   │ │ Nextcloud│ │ Pihole   │    │
│  │ UP  12ms │ │ DOWN  -- │ │ UP   8ms │    │
│  │ 100% ↑↑↑ │ │  80% ↑↓↑ │ │  95% ↑↑↑ │    │
│  └──────────┘ └──────────┘ └──────────┘    │
│                                             │
│  PING LOG ─────────────────────────────     │
│  [Router] 12ms UP · [Pihole] 8ms UP  ...   │
└─────────────────────────────────────────────┘
```

**Target card (Mantine `Card`):**
- Name + URL in monospace text
- Mantine `Badge`: bright green `UP` / red `DOWN`
- Latency in ms (or `--` when down)
- Uptime % from last 20 pings
- 20 colored mini `Box` squares (green = up, red = down) as ping history strip
- Trash icon button to delete the target

**Add Target modal (Mantine `Modal`):**
- `TextInput` for Name
- `TextInput` for URL (placeholder: `http://192.168.1.50:8080`)
- Submit button → `POST /api/targets` → close modal → next poll picks up new target

**Polling:**
```ts
useEffect(() => {
  const load = () => fetch('/api/status').then(r => r.json()).then(setData)
  load()
  const id = setInterval(load, 5000)
  return () => clearInterval(id)
}, [])
```

---

## Docker Configuration

### `next.config.ts`

```ts
output: 'standalone'
```

### `Dockerfile` — 3-stage build

| Stage | Base | Purpose |
|---|---|---|
| `deps` | `node:20-alpine` | Install production + dev dependencies |
| `builder` | `node:20-alpine` | Run `npm run build`, produces `.next/standalone` |
| `runner` | `node:20-alpine` | Copy standalone output only, run `node server.js` |

**Important:** `better-sqlite3` is a native Node.js addon requiring compilation. The `deps` stage must install Alpine build tools (`python3 make g++`) before `npm ci`, then remove them after. Without these, the Docker build fails during `npm ci`.

### `docker-compose.yml`

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

`./data` on the LXC host → `/app/data` in container. SQLite file survives container rebuilds.

---

## Key Dependencies

| Package | Purpose |
|---|---|
| `next@15` | Framework |
| `react@19` | UI runtime |
| `@mantine/core@7` | Component library |
| `@mantine/hooks@7` | Mantine hooks |
| `drizzle-orm` | ORM |
| `better-sqlite3` | SQLite driver (sync, ideal for Next.js server) |
| `drizzle-kit` | Migrations CLI |
| `@types/better-sqlite3` | Types |

---

## Out of Scope

- Authentication / access control
- Alerting (email, webhook, etc.)
- Historical data beyond last 20 pings per target
- Automatic ping history pruning (table grows indefinitely — acceptable for homelab demo)
- ICMP ping support
- Multiple users / multi-tenancy
