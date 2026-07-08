// Mock backend serving the frozen @b2b/shared contract shapes.
// In-memory only. Lets the frontend develop before Codex's real backend lands.
// ponytail: no persistence, no real Telegram auth — this is a fixture server, not the backend.

import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import Fastify from 'fastify';
import {
  DeliveryType,
  OrderAction,
  OrderStatus,
  ORDER_TRANSITIONS,
  PaymentType,
  SIDE_EFFECT_STATUS,
  createClientSchema,
  createOrderSchema,
  recordPaymentSchema,
  setPriceSchema,
  copyPricesSchema,
  transitionSchema,
  updateClientSchema,
} from '@b2b/shared';
import type {
  Client,
  LedgerEntry,
  OfferedProduct,
  Order,
  ServerEvent,
  Subscribe,
} from '@b2b/shared';
import { clientPrices, clients, products, users } from './fixtures.js';

let seq = 1;
const id = (p: string) => `${p}${seq++}`;
const now = () => new Date(1735689600000 + seq * 1000).toISOString(); // deterministic-ish

const orders: Order[] = [];
const ledger: LedgerEntry[] = [];

const clientById = (cid: string) => clients.find((c) => c.id === cid);
const balanceOf = (cid: string) =>
  ledger.filter((e) => e.clientId === cid).reduce((s, e) => s + (e.type === 'charge' ? e.amount : -e.amount), 0);
const syncBalance = (cid: string) => {
  const c = clientById(cid);
  if (c) c.balance = balanceOf(cid);
};

function offered(clientId?: string): OfferedProduct[] {
  const prices = clientId ? clientPrices[clientId] ?? [] : [];
  return products.map((p) => ({
    ...p,
    clientPrice: prices.find((cp) => cp.productId === p.id)?.price ?? null,
  }));
}

function yandexDeeplink(lat?: number, lng?: number): string {
  if (lat == null || lng == null) return 'https://yandex.uz/maps/';
  return `https://yandex.uz/maps/?rtext=~${lat},${lng}&rtt=auto`;
}

// --- WebSocket hub ---
// Minimal structural type for a ws socket — avoids depending on `ws` directly.
type Sock = { readyState: number; OPEN: number; send(data: string): void; on(ev: string, cb: (...a: any[]) => void): void };
type Sub = { socket: Sock; sub: Subscribe };
const subs: Sub[] = [];
function broadcast(event: ServerEvent) {
  const order = event.order;
  for (const { socket, sub } of subs) {
    const relevant =
      sub.subscribe === 'kds'
        ? true
        : sub.subscribe === 'manager'
        ? order.createdBy === sub.userId
        : order.driverId === sub.driverId;
    if (relevant && socket.readyState === socket.OPEN) socket.send(JSON.stringify(event));
  }
}

const app = Fastify({ logger: false });
await app.register(cors, { origin: true });
await app.register(websocket);

app.get('/ws', { websocket: true }, (socket: Sock) => {
  socket.on('message', (raw: Buffer) => {
    try {
      const sub = JSON.parse(raw.toString()) as Subscribe;
      subs.push({ socket, sub });
    } catch {
      /* ignore */
    }
  });
  socket.on('close', () => {
    const i = subs.findIndex((s) => s.socket === socket);
    if (i >= 0) subs.splice(i, 1);
  });
});

// --- Auth (mock: ignores initData, returns the manager) ---
app.post('/auth/telegram', async () => ({ token: 'mock-token', user: users[0] }));

// --- Products ---
app.get('/products', async (req) => {
  const clientId = (req.query as { clientId?: string }).clientId;
  return offered(clientId);
});
app.post('/poster/webhook', async () => ({ ok: true }));
app.post('/admin/sync/products', async () => ({ synced: products.length }));

// --- Clients ---
app.get('/clients', async () => clients);
app.post('/clients', async (req, reply) => {
  const body = createClientSchema.parse(req.body);
  const c: Client = { id: id('c'), balance: 0, ...body };
  clients.push(c);
  clientPrices[c.id] = [];
  return reply.code(201).send(c);
});
app.get('/clients/:id', async (req, reply) => {
  const c = clientById((req.params as { id: string }).id);
  return c ? c : reply.code(404).send({ error: 'not found' });
});
app.patch('/clients/:id', async (req, reply) => {
  const c = clientById((req.params as { id: string }).id);
  if (!c) return reply.code(404).send({ error: 'not found' });
  Object.assign(c, updateClientSchema.parse(req.body));
  return c;
});

// --- Pricing ---
app.get('/clients/:id/prices', async (req) => clientPrices[(req.params as { id: string }).id] ?? []);
app.put('/clients/:id/prices/:productId', async (req) => {
  const { id: cid, productId } = req.params as { id: string; productId: string };
  const { price } = setPriceSchema.parse(req.body);
  const list = (clientPrices[cid] ??= []);
  const existing = list.find((p) => p.productId === productId);
  if (existing) existing.price = price;
  else list.push({ productId, price });
  return { productId, price };
});
app.post('/clients/:id/prices/copy', async (req) => {
  const cid = (req.params as { id: string }).id;
  const { fromClientId } = copyPricesSchema.parse(req.body);
  clientPrices[cid] = (clientPrices[fromClientId] ?? []).map((p) => ({ ...p }));
  return clientPrices[cid];
});
app.post('/clients/:id/prices/base', async (req) => {
  const cid = (req.params as { id: string }).id;
  clientPrices[cid] = products.map((p) => ({ productId: p.id, price: p.basePrice }));
  return clientPrices[cid];
});

// --- Ledger ---
app.get('/clients/:id/ledger', async (req) => {
  const cid = (req.params as { id: string }).id;
  return { balance: balanceOf(cid), entries: ledger.filter((e) => e.clientId === cid) };
});
app.post('/clients/:id/payments', async (req) => {
  const cid = (req.params as { id: string }).id;
  const body = recordPaymentSchema.parse(req.body);
  const entry: LedgerEntry = { id: id('l'), clientId: cid, type: 'payment', createdBy: 'u1', createdAt: now(), ...body };
  ledger.push(entry);
  syncBalance(cid);
  return entry;
});

// --- Orders ---
app.get('/orders', async (req) => {
  const q = req.query as { status?: string };
  return q.status ? orders.filter((o) => o.status === q.status) : orders;
});
app.post('/orders', async (req, reply) => {
  const body = createOrderSchema.parse(req.body);
  const client = clientById(body.clientId);
  if (!client) return reply.code(400).send({ error: 'unknown client' });
  const prices = clientPrices[body.clientId] ?? [];
  const items = body.items.map((it) => {
    const p = products.find((x) => x.id === it.productId)!;
    const unitPrice = prices.find((cp) => cp.productId === it.productId)?.price ?? p.basePrice;
    return { productId: it.productId, name: p.name, qty: it.qty, unitPrice, lineTotal: unitPrice * it.qty };
  });
  const order: Order = {
    id: id('o'),
    clientId: body.clientId,
    clientName: client.name,
    createdBy: 'u1',
    status: OrderStatus.New,
    items,
    total: items.reduce((s, i) => s + i.lineTotal, 0),
    paymentType: body.paymentType,
    location: body.location,
    contactPhone: body.contactPhone,
    portions: body.portions,
    notes: body.notes,
    createdAt: now(),
    updatedAt: now(),
  };
  orders.push(order);
  broadcast({ type: 'order.created', order });
  return reply.code(201).send(order);
});
app.get('/orders/:id', async (req, reply) => {
  const o = orders.find((x) => x.id === (req.params as { id: string }).id);
  return o ? o : reply.code(404).send({ error: 'not found' });
});
app.post('/orders/:id/transition', async (req, reply) => {
  const o = orders.find((x) => x.id === (req.params as { id: string }).id);
  if (!o) return reply.code(404).send({ error: 'not found' });
  const body = transitionSchema.parse(req.body);
  const rule = ORDER_TRANSITIONS[body.action];
  if (!rule.from.includes(o.status)) return reply.code(409).send({ error: `cannot ${body.action} from ${o.status}` });

  const wasBeforeSideEffect = o.status !== SIDE_EFFECT_STATUS && !o.posterOrderId;
  o.status = rule.to;
  o.updatedAt = now();

  if (body.action === OrderAction.Ready && wasBeforeSideEffect) {
    o.posterOrderId = `poster-${o.id}`; // mock writeback
    const charge: LedgerEntry = { id: id('l'), clientId: o.clientId, orderId: o.id, type: 'charge', amount: o.total, createdBy: 'u2', createdAt: now() };
    ledger.push(charge);
    syncBalance(o.clientId);
  }
  if (body.action === OrderAction.Assign) {
    o.deliveryType = body.deliveryType;
    if (body.deliveryType === DeliveryType.OwnDriver) o.driverId = body.driverId;
    if (body.deliveryType === DeliveryType.Yandex) o.yandexDeeplink = yandexDeeplink(o.location.lat, o.location.lng);
  }
  if (body.action === OrderAction.Deliver) o.cashCollected = body.cashCollected ?? o.paymentType === PaymentType.Cash;
  if (body.action === OrderAction.Close && o.paymentType !== PaymentType.Transfer) {
    const pay: LedgerEntry = { id: id('l'), clientId: o.clientId, orderId: o.id, type: 'payment', amount: o.total, method: o.paymentType, createdBy: 'u1', createdAt: now() };
    ledger.push(pay);
    syncBalance(o.clientId);
  }
  if (body.action === OrderAction.Cancel && o.posterOrderId) {
    // reverse the charge (mock)
    const rev: LedgerEntry = { id: id('l'), clientId: o.clientId, orderId: o.id, type: 'payment', amount: o.total, method: 'reversal', note: 'cancel after Ready', createdBy: 'u1', createdAt: now() };
    ledger.push(rev);
    syncBalance(o.clientId);
  }

  broadcast({ type: 'order.updated', order: o });
  return o;
});

const port = Number(process.env.PORT ?? 4000);
await app.listen({ port, host: '0.0.0.0' });
console.log(`[mock] B2B contract server on http://localhost:${port}`);
