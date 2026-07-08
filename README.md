# kamolliddin-cam — B2B ordering + core

Telegram-based B2B ordering for a cafe, on top of Poster POS. Manager creates orders at
per-client prices → kitchen display (KDS) → own driver / Yandex → cash + debt ledger.
Poster is the source of truth for menu/stock/revenue; per-client pricing, the order
pipeline and the AR ledger live in this backend.

Docs: `docs/superpowers/specs/` (design) and `docs/superpowers/plans/` (plan).

## Monorepo (pnpm)

- `packages/shared` — frozen API contract (types, enums, Zod, REST/WS, order state machine)
- `packages/web-kit` — design tokens + docket component + typed API/WS clients
- `apps/backend` — Fastify + Postgres (Drizzle), auth, orders, pricing, ledger, poster-sync, realtime
- `apps/manager`, `apps/driver` — Telegram mini apps (React)
- `apps/kds` — kitchen display (web monitor)
- `apps/mock` — in-memory contract server for frontend dev

## Run locally

```bash
pnpm install

# 1) Postgres (host port 5433 — 5432 is often taken by a local Postgres)
docker compose up -d postgres
export DATABASE_URL="postgres://b2b:b2b@localhost:5433/b2b"
pnpm --filter @b2b/backend migrate
pnpm --filter @b2b/backend seed

# 2) Backend on :4000 (dev-auth on, fake Poster + no bot in dev)
pnpm --filter @b2b/backend dev

# 3) Frontends (each in its own terminal)
pnpm --filter @b2b/kds     dev   # :5175
pnpm --filter @b2b/driver  dev   # :5176
pnpm --filter @b2b/manager dev   # :5177
```

Frontend-only against the mock (no Postgres): `pnpm --filter @b2b/mock dev` (serves :4000).

Tests: `pnpm --filter @b2b/backend test`

## Before production

- **Poster API**: verify the `// VERIFY:` items in `apps/backend/src/poster-sync/` against a real
  Poster v3 account (product list fields, `incomingOrders.createIncomingOrder` price/spot, order void).
- Set a real `BOT_TOKEN` and register the mini apps on the bot; leave `DEV_AUTH` unset in prod.
- Choose a production host (deploy TBD).
