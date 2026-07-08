# B2B Ordering + Core — Design Spec

**Date:** 2026-07-08
**Scope:** Shared Core + B2B ordering app (first sub-project of the cafe platform)
**Status:** Approved design → ready for implementation plan

---

## 1. Overview

A Telegram-based B2B ordering system for a cafe/restaurant. A B2B manager creates
orders for company clients at per-client custom prices. Orders flow through a
kitchen display (KDS), then get dispatched by an own driver or a Yandex deeplink,
with cash reconciliation and a per-client debt ledger.

**Poster POS is the source of truth** for menu, ingredients/cost, stock and revenue.
Everything Poster cannot do (per-client pricing, B2B order pipeline, delivery
dispatch, AR/debt ledger) lives in our own backend + Postgres.

This is sub-project 1 of a larger platform. Later sub-projects (each its own spec):
Inventory + Procurement app, Owner dashboard.

## 2. Non-goals (explicitly deferred)

- Client self-service ordering (MVP: manager creates all orders)
- PDF invoices / monthly reconciliation acts (`akt`/`vedomost`)
- Yandex Delivery **API** integration (MVP: deeplink only)
- Owner dashboard, Inventory/Procurement app (separate sub-projects)
- Margin/profit visibility, menu engineering
- Multi-location (1 Poster spot for MVP)

## 3. Architecture & stack

Full TypeScript. Single modular monolith backend (no microservices — one restaurant).

- **Frontends (React + Vite):**
  - Manager Telegram Mini App
  - Driver Telegram Mini App
  - Kitchen KDS — plain web app for a wall monitor (not Telegram)
- **Backend:** Node + Fastify. Modules: `orders`, `pricing`, `ledger`, `kds`,
  `delivery`, `auth`, `poster-sync`.
- **DB:** Postgres.
- **Bot:** grammY (Telegram push notifications, mini-app launch).
- **Real-time:** WebSocket (live KDS columns, order status to manager/driver).
- **Deploy:** local Docker Compose for now (backend + Postgres + frontends);
  production host decided later.

```
Telegram: Manager MiniApp | Driver MiniApp        Monitor: KDS web
                    \___________ HTTPS + WebSocket ___________/
                                     |
                         Fastify backend (TS)
              orders · pricing · ledger · kds · delivery · auth
                         poster-sync module
                          /              \
                    Postgres          Poster POS (API + webhook)
                   (our data)         (menu, stock, revenue)
```

## 4. Poster integration

**Sync model = Approach A: local cache + webhook + daily reconcile.**

- Products/menu cached locally in `products` table. Updated by Poster webhooks on
  product change; full reconcile sync once daily as a safety net.
- Ingredient cost pulled per product (for later margin features; stored now, unused in MVP UI).
- **Writeback:** when an order reaches **READY**, create a Poster incoming order via
  `incomingOrders` API with our custom line prices → Poster deducts stock and records revenue.
- `poster_order_id` stored on the order.

**To verify during implementation (Poster API v3):**
- Webhooks available on the account's plan; if not, fall back to 15-min polling (Approach C).
- `incomingOrders.createIncomingOrder` accepts custom per-line price and a spot id.
- How to reverse/void a written order (needed for post-READY cancellation).

**Access:** API token exists, single spot.

## 5. Roles & auth

Telegram-based auth (Mini App `initData` validation — no passwords). Role per user:

| Role | Surface | Can do |
|---|---|---|
| Manager | Manager Mini App | clients, pricing, create orders, assign delivery, confirm cash, ledger, reports |
| Kitchen | KDS web | move order cards across 3 columns |
| Driver | Driver Mini App | see assigned order, mark picked-up/delivered, mark cash collected |
| Owner | (read-only, later) | audit clients/pricing; full dashboard is a later sub-project |

Pricing/clients are **set by managers**; owner audits (read/view), does not enter each price.

## 6. Data model (Postgres)

- **users** — `telegram_id`, `role`, `name`, `phone`, `active`
- **clients** (companies) — `name`, `contact_name`, `contact_phone`, `locations[]`
  (address + geo), `balance` (derived from ledger), `notes`
- **products** (cache from Poster) — `poster_id`, `name`, `category`, `base_price`,
  `cost`, `unit`, `is_stopped` (stop-list), `synced_at`
- **client_prices** — `client_id`, `product_id`, `price`. Absent row = not offered to that client.
- **orders** — `client_id`, `created_by`, `status`, `total`, `payment_type`
  (cash | transfer | prepaid), `delivery_type` (own_driver | yandex), `driver_id`,
  `location`, `contact_phone`, `portions`, `notes`, `poster_order_id`, timestamps
- **order_items** — `order_id`, `product_id`, `qty`, `unit_price` (snapshot, editable
  before READY), `line_total`
- **ledger_entries** — `client_id`, `order_id?`, `type` (charge | payment), `amount`,
  `method`, `created_by`, `note`, `created_at`. Client balance = SUM(charge) − SUM(payment).
- **drivers** — reuse `users` with role=driver (name, phone, active)

## 7. Order lifecycle

```
create ─▶ NEW ─▶ PREPARING ─▶ READY ─▶ ASSIGNED ─▶ DELIVERING ─▶ DELIVERED ─▶ CLOSED
          (KDS)   (KDS)        (KDS)   (manager)     (driver)      (driver)    (manager)
                                 │
                    NEW/PREPARING └▶ CANCELLED (no side effects)
                    after READY ────▶ CANCELLED (Poster reversal + ledger reversal)
```

| Transition | Actor | Side effects |
|---|---|---|
| → NEW | manager creates | appears in KDS "New" column |
| NEW → PREPARING | kitchen | — (card moves) |
| PREPARING → READY | kitchen | **Poster writeback** (stock↓, revenue) + **ledger charge** (debt↑) + **push to manager** |
| READY → ASSIGNED | manager picks driver / Yandex | own driver → push to driver; Yandex → deeplink with location |
| ASSIGNED → DELIVERING | driver "picked up" | manager tracks live |
| DELIVERING → DELIVERED | driver "delivered" | if cash: "cash collected" flag |
| DELIVERED → CLOSED | manager "cash received" | **ledger payment** (debt↓); prepaid auto-closes |
| → CANCELLED | manager/owner | before READY: none; after READY: reverse Poster order + reverse ledger charge |

**Key decisions:**
- Poster writeback + ledger charge happen at **READY** (quantities final; orders
  cancelled during prep cost nothing). Manager can fix an order after the fact if wrong.
- Poster = revenue/stock truth; our ledger = accounts-receivable (who owes what).

## 8. Features by role (MVP)

**Manager Mini App**
- Clients: create/edit (name, contact phone, location)
- Pricing: set per-client price per product; helpers "copy from another client" and
  "start from base price" (avoid tedious manual entry)
- Create order: client, products + qty, portions, location, contact — all required
- Receive READY push → assign own driver or Yandex (deeplink)
- Confirm "cash received" for cash orders
- Ledger: per-company balance, record payments (incl. partial)
- Reports ("Hisobotlarim"): orders, revenue, debtors

**Kitchen KDS (web monitor)**
- 3 live columns: New / Preparing / Ready
- Move card between columns; moving to Ready triggers Poster + ledger + push

**Driver Mini App**
- Assigned order details (items, location, contact, cash amount)
- Buttons: picked up / delivered / cash collected

## 9. Real-time

WebSocket channels:
- KDS subscribes to order events (create, status change) → live columns
- Manager subscribes to their orders (READY, driver progress)
- Driver subscribes to assigned orders
- Telegram push (grammY) as the notification transport for READY / assignment

## 10. Prerequisites & assumptions

- Poster API token available; single spot.
- One Telegram bot; mini apps launched from it, role resolved by `telegram_id`.
- Development on local Docker Compose; production host TBD.
- Currency/locale: UZS, Uzbek UI.

## 11. Verification

Per project `codex-first` rule: Claude writes spec + reviews diffs; Codex implements.
Each module ships one runnable check (assert-based self-check or a small test):
- pricing: resolve price for (client, product) with/without a `client_prices` row
- ledger: balance = charges − payments across a mixed sequence
- order state machine: illegal transitions rejected; READY fires side effects once
- poster-sync: writeback payload shape; cache upsert idempotent
End-to-end: create → move through KDS → assign → deliver → close, and confirm
ledger balance + Poster writeback (against a Poster sandbox/mock first).
