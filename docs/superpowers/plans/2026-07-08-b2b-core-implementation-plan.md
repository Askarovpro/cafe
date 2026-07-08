# B2B Ordering + Core — Implementation Plan

> **For agentic workers:** This plan uses a split execution model (see Execution Model).
> Backend is delegated to Codex from a frozen contract; frontend is built by Claude with
> design agents. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the B2B ordering pipeline (manager → kitchen KDS → driver → cash ledger) on
top of Poster POS, as Telegram Mini Apps + a kitchen web display.

**Architecture:** TS monorepo (pnpm workspaces). A Fastify backend owns orders, pricing,
ledger and Poster sync against Postgres. Three React frontends (manager mini app, driver
mini app, kitchen KDS) talk to it over REST + WebSocket. Poster is the source of truth for
menu/stock/revenue; our DB owns per-client pricing, the order pipeline and the AR ledger.

**Tech Stack:** TypeScript, pnpm workspaces, Fastify, Postgres (+ Drizzle or Prisma),
`ws`/socket.io, grammY (Telegram bot), React + Vite, Zod (shared validation), Docker Compose.

## Global Constraints (verbatim from spec)

- Poster POS is the source of truth for menu, ingredient cost, stock, revenue.
- 1 Poster spot; API token available. Verify webhook availability; else 15-min polling.
- Poster writeback + ledger charge happen at order state **READY**, not before.
- Cancel before READY = no side effects; after READY = reverse Poster order + ledger charge.
- Ledger: client balance = SUM(charge) − SUM(payment).
- Auth = Telegram Mini App `initData` validation; no passwords. Roles: manager, kitchen, driver, owner.
- Pricing/clients set by managers; owner is read-only (owner UI is a later sub-project).
- Currency UZS, Uzbek UI. Local Docker for now; production host TBD.
- MVP non-goals: client self-service, PDF acts, Yandex API (deeplink only), owner dashboard,
  inventory app, margin/menu-engineering.

---

## Execution Model (this project's `codex-first` rule)

| Phase | Owner | Why |
|---|---|---|
| 0. API contract + shared types | **Claude** | API design stays with Claude; both tracks depend on it. Frozen before parallel work. |
| 1. Backend | **Codex** | Implementation from a frozen contract — Codex's sweet spot. Claude writes the work-order + reviews the diff. |
| 2. Frontend (3 apps) | **Claude** | Built with design agents/skills against the mock server, then wired to the real API. |
| 3. Integration + review | **Claude** | Wire real API, end-to-end drive, review Codex diff like a PR. |

Phases 1 and 2 run **in parallel** once Phase 0 is frozen (frontend develops against a mock
that returns the contract's shapes).

---

## Package / File Structure

```
kamolliddin-cam/
  package.json                 # pnpm workspace root
  pnpm-workspace.yaml
  docker-compose.yml           # postgres + backend + (optional) frontends
  packages/
    shared/                    # Phase 0 — the frozen contract
      src/
        types.ts               # DTOs: Product, Client, Order, OrderItem, LedgerEntry, User
        enums.ts               # Role, OrderStatus, OrderAction, PaymentType, DeliveryType
        api.ts                 # endpoint paths + request/response type map
        ws.ts                  # WebSocket event names + payload types
        schemas.ts             # Zod schemas mirroring types (shared validation)
  apps/
    backend/                   # Phase 1 — Codex
      src/
        modules/{auth,products,clients,pricing,orders,ledger,delivery,poster-sync}/
        realtime/              # ws hub + subscriptions
        db/                    # schema + migrations
        server.ts
      test/
      mock/                    # Phase 0 deliverable: mock server serving contract shapes
    manager/                   # Phase 2 — Claude (Telegram Mini App)
    driver/                    # Phase 2 — Claude (Telegram Mini App)
    kds/                       # Phase 2 — Claude (kitchen web monitor)
```

Split by responsibility: each backend module owns one domain; each frontend app is one role.
`packages/shared` is the single source of the interface — no type is redefined in an app.

---

## Phase 0 — API Contract (Claude, frozen before Phases 1–2)

Deliverable: `packages/shared` compiles, plus a `apps/backend/mock` server returning
contract-shaped fixtures so the frontend can develop immediately.

### Enums (`packages/shared/src/enums.ts`)

```ts
export enum Role { Manager = 'manager', Kitchen = 'kitchen', Driver = 'driver', Owner = 'owner' }
export enum OrderStatus {
  New = 'new', Preparing = 'preparing', Ready = 'ready',
  Assigned = 'assigned', Delivering = 'delivering', Delivered = 'delivered',
  Closed = 'closed', Cancelled = 'cancelled',
}
export enum OrderAction {
  StartPrep = 'start_prep', Ready = 'ready', Assign = 'assign',
  Pickup = 'pickup', Deliver = 'deliver', Close = 'close', Cancel = 'cancel',
}
export enum PaymentType { Cash = 'cash', Transfer = 'transfer', Prepaid = 'prepaid' }
export enum DeliveryType { OwnDriver = 'own_driver', Yandex = 'yandex' }
```

### Core DTOs (`packages/shared/src/types.ts`)

```ts
export interface Product { id: string; posterId: string; name: string; category: string;
  basePrice: number; cost: number; unit: string; isStopped: boolean; }
export interface ClientLocation { label: string; address: string; lat?: number; lng?: number; }
export interface Client { id: string; name: string; contactName: string; contactPhone: string;
  locations: ClientLocation[]; balance: number; notes?: string; }
export interface ClientPrice { productId: string; price: number; }
// Product enriched with the client's price (null price = not offered to this client)
export interface OfferedProduct extends Product { clientPrice: number | null; }
export interface OrderItem { productId: string; name: string; qty: number;
  unitPrice: number; lineTotal: number; }
export interface Order { id: string; clientId: string; clientName: string;
  createdBy: string; status: OrderStatus; items: OrderItem[]; total: number;
  paymentType: PaymentType; deliveryType?: DeliveryType; driverId?: string;
  location: ClientLocation; contactPhone: string; portions: number; notes?: string;
  posterOrderId?: string; cashCollected?: boolean;
  createdAt: string; updatedAt: string; }
export interface LedgerEntry { id: string; clientId: string; orderId?: string;
  type: 'charge' | 'payment'; amount: number; method?: string; note?: string;
  createdBy: string; createdAt: string; }
export interface User { id: string; telegramId: string; role: Role; name: string; phone?: string; }
```

### REST endpoints (`packages/shared/src/api.ts` documents these)

```
POST   /auth/telegram              body {initData}            → {token, user}
GET    /products?clientId=         → OfferedProduct[]   (clientPrice merged if clientId)
POST   /poster/webhook             (Poster → us; product changes)  → 200
POST   /admin/sync/products        (manual full resync)       → {synced:number}

GET    /clients                    → Client[]
POST   /clients                    body Partial<Client>       → Client
GET    /clients/:id                → Client
PATCH  /clients/:id                body Partial<Client>       → Client
GET    /clients/:id/prices         → ClientPrice[]
PUT    /clients/:id/prices/:pid    body {price}               → ClientPrice
POST   /clients/:id/prices/copy    body {fromClientId}        → ClientPrice[]
POST   /clients/:id/prices/base    (seed all from basePrice)  → ClientPrice[]
GET    /clients/:id/ledger         → {balance, entries: LedgerEntry[]}
POST   /clients/:id/payments       body {amount, method, note}→ LedgerEntry

POST   /orders                     body CreateOrder           → Order
GET    /orders?status=&mine=       (role-scoped)              → Order[]
GET    /orders/:id                 → Order
POST   /orders/:id/transition      body {action, ...payload}  → Order
```

`CreateOrder = { clientId, items:{productId,qty}[], portions, location, contactPhone,
paymentType, notes? }`. Server computes `unitPrice`/`lineTotal`/`total` from `client_prices`.

`transition` payloads: `Assign → {deliveryType, driverId?}` (returns Order incl.
`yandexDeeplink?` when Yandex); `Deliver → {cashCollected?:boolean}`; others no payload.
Server enforces the state machine + role per transition; illegal transition → 409.

### WebSocket (`packages/shared/src/ws.ts`)

```ts
export type ServerEvent =
  | { type: 'order.created'; order: Order }
  | { type: 'order.updated'; order: Order };
// Client sends {subscribe: 'kds' | 'manager' | {driver: driverId}} after connect.
// kds → all active orders; manager → orders they created; driver → assigned orders.
```

- [ ] Write `enums.ts`, `types.ts`, `schemas.ts` (Zod mirrors), `api.ts`, `ws.ts`
- [ ] `pnpm --filter shared build` passes (tsc, no errors)
- [ ] Build `apps/backend/mock`: Fastify server serving fixtures for every GET/POST above and a WS that emits `order.updated` on transition
- [ ] Commit: `feat(shared): freeze B2B API contract + mock server`

**Gate:** contract committed. Phases 1 and 2 start in parallel from here.

---

## Phase 1 — Backend (Codex work-order)

Claude hands Codex the frozen `packages/shared` + the design spec. Codex implements
`apps/backend` to satisfy the contract exactly, using TDD, and returns files-changed + test output.
Codex prompt (built at execution time) states: goal, repo path, that `packages/shared` types are
authoritative and must not be edited, non-goals (no owner/inventory), and required proof
(per-module tests below all green).

Backend modules + the check each must ship (Codex writes the tests; these are the acceptance bars):

- [ ] **auth** — validate Telegram `initData` HMAC; resolve/create user by `telegramId`; issue token.
  Check: valid initData → user; tampered initData → 401.
- [ ] **poster-sync** — cache products (webhook upsert + manual full sync); idempotent upsert.
  Check: same product synced twice → one row, fields updated; webhook payload upserts.
- [ ] **pricing** — resolve offered price for (client, product); copy-from / seed-from-base helpers.
  Check: with `client_prices` row → that price; without → `clientPrice:null`; copy replicates set.
- [ ] **orders** — create (compute totals from client prices); guarded state machine transitions with role checks.
  Check: illegal transition → 409; role mismatch → 403; totals computed from client price snapshot.
- [ ] **READY side effects** — on `Ready`: create Poster incoming order + ledger charge, exactly once.
  Check: transition to Ready twice → one Poster call, one charge (idempotent); cancel-after-Ready reverses both.
- [ ] **ledger** — charge/payment entries; balance = charges − payments; partial payments.
  Check: mixed sequence → correct balance; payment endpoint appends entry + lowers balance.
- [ ] **delivery** — assign own driver (push) or Yandex (return deeplink built from location).
  Check: Yandex assign → Order carries a well-formed `yandexDeeplink` with lat/lng; own driver → driver notified.
- [ ] **realtime** — ws hub; subscriptions (kds/manager/driver) receive relevant `order.updated`.
  Check: driver socket only receives its assigned orders; kds receives all active.

Poster API specifics to confirm first (from spec §4): webhook availability, `incomingOrders`
custom line price + spot, order void/reverse. If webhooks unavailable → 15-min polling.

**Claude review gate:** `git diff` read like a PR; run the backend test suite; drive create→ready→
assign→deliver→close against a Poster sandbox/mock. Iterate via `codex ... resume`; after 2 failed
rounds Claude takes over. Only then is Phase 1 done.

---

## Phase 2 — Frontend (Claude, parallel with Phase 1, against the mock)

Shared frontend setup (do once):

- [ ] Vite + React + TS app scaffold per app; import types from `packages/shared`
- [ ] `@telegram-apps/sdk` init for `manager` and `driver` (read `initData`, theme params); KDS is plain web
- [ ] Thin API client + WS client typed against `packages/shared`; base URL points at mock first

Build order (each app = independently reviewable):

- [ ] **Manager app** — clients list/create/edit; per-client pricing screen (with copy/seed helpers);
  order create form (required: client, items+qty, portions, location, contact); active orders +
  READY alerts; assign driver/Yandex; cash-received confirm; ledger (balance + record payment); reports.
- [ ] **KDS** — 3 live columns (New/Preparing/Ready) fed by WS; move card = transition call; big, glanceable, monitor-sized.
- [ ] **Driver app** — assigned order (items, location, contact, cash amount); pickup/deliver/cash-collected buttons.

Design execution: use the `frontend-design` skill for aesthetic direction and the ui-design agents
for component build; Telegram theme params drive colors so the mini apps feel native. Each screen
ends with a visual check (screenshot/drive) before moving on.

- [ ] Commit per app: `feat(<app>): ...`

---

## Phase 3 — Integration + Review

- [ ] Point frontend API/WS base URLs at the real backend (env switch)
- [ ] End-to-end drive: manager creates order → appears on KDS → kitchen advances to Ready →
  manager gets alert → assigns driver → driver delivers → manager confirms cash → ledger balance correct →
  Poster shows the incoming order and stock decrement
- [ ] Confirm cancel-after-Ready reverses Poster + ledger
- [ ] `docker-compose up` brings up postgres + backend + serves the three apps
- [ ] Review Codex backend diff as a PR; run full suite; `/code-review` before ship
- [ ] Commit: `chore: wire frontends to backend + e2e verified`

---

## Self-Review

**Spec coverage:** roles ✓ (auth), pricing per-client + helpers ✓ (pricing), order lifecycle +
READY side effects ✓ (orders/READY), ledger ✓ (ledger), driver + Yandex deeplink ✓ (delivery),
Poster sync/writeback ✓ (poster-sync), real-time KDS/push ✓ (realtime + Phase 2), all three
surfaces ✓ (Phase 2). Non-goals excluded ✓.

**Placeholders:** none — endpoints, types, and per-module acceptance checks are concrete. Backend
uses work-order granularity (Codex owns its TDD steps) by design of the execution model, not as a gap.

**Type consistency:** frontend and backend both consume `packages/shared`; no type is redefined.
`OrderAction`/`OrderStatus`/transition payloads match between the contract and the backend/frontend tasks.
