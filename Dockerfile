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
