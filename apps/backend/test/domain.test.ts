import { describe, expect, it } from 'vitest';
import {
  CashCustody,
  DeliveryType,
  OrderAction,
  OrderStatus,
  PaymentType,
  Role,
  type Client,
  type Product,
  type User,
} from '@b2b/shared';
import { createAppServices } from '../src/app-services.js';
import { FakePosterClient } from '../src/poster-sync/poster-client.js';
import { RealtimeHub } from '../src/realtime/hub.js';
import { MemoryRepository } from '../src/repositories/memory.js';
import { createTelegramInitData } from '../src/auth/telegram-init-data.js';
import { buildServer } from '../src/server.js';

const productA: Product = {
  id: 'p1',
  posterId: '101',
  name: 'Osh',
  category: 'Main',
  basePrice: 35000,
  cost: 18000,
  unit: 'portion',
  isStopped: false,
};

const productB: Product = {
  id: 'p2',
  posterId: '102',
  name: 'Somsa',
  category: 'Bakery',
  basePrice: 12000,
  cost: 5000,
  unit: 'piece',
  isStopped: false,
};

const client: Client = {
  id: 'c1',
  name: 'Acme',
  contactName: 'Ali',
  contactPhone: '+998901112233',
  locations: [{ label: 'Office', address: 'Tashkent', lat: 41.31, lng: 69.27 }],
  balance: 0,
};

const manager: User = { id: 'u-manager', telegramId: '1001', role: Role.Manager, name: 'Manager' };
const kitchen: User = { id: 'u-kitchen', telegramId: '1002', role: Role.Kitchen, name: 'Kitchen' };
const driver: User = { id: 'u-driver', telegramId: '1003', role: Role.Driver, name: 'Driver' };
const finance: User = { id: 'u-finance', telegramId: '1004', role: Role.Finance, name: 'Finance' };

function seededServices(options: { devAuth?: boolean } = {}) {
  const repo = new MemoryRepository();
  const poster = new FakePosterClient();
  const notified: string[] = [];
  const services = createAppServices({
    repo,
    poster,
    jwtSecret: 'test-jwt-secret',
    botToken: '123456:test-token',
    devAuth: options.devAuth,
    notifier: { notifyUser: async (userId, text) => void notified.push(`${userId}:${text}`) },
  });

  repo.seed({
    users: [manager, kitchen, driver, finance],
    clients: [client],
    products: [productA, productB],
    clientPrices: [{ clientId: client.id, productId: productA.id, price: 32000 }],
  });

  return { repo, poster, services, notified };
}

describe('pricing', () => {
  it('returns clientPrice when a row exists and null when absent', async () => {
    const { services } = seededServices();

    const offered = await services.products.listOffered(client.id);

    expect(offered.find((p) => p.id === productA.id)?.clientPrice).toBe(32000);
    expect(offered.find((p) => p.id === productB.id)?.clientPrice).toBeNull();
  });
});

describe('ledger', () => {
  it('balances mixed charges, payments, and partial payments', async () => {
    const { services } = seededServices();

    await services.ledger.appendCharge({ clientId: client.id, orderId: 'o1', amount: 100000, createdBy: manager.id });
    await services.ledger.recordPayment(client.id, { amount: 25000, method: 'cash' }, manager);
    await services.ledger.recordPayment(client.id, { amount: 10000, method: 'transfer', note: 'partial' }, manager);
    await services.ledger.appendCharge({ clientId: client.id, orderId: 'o2', amount: 15000, createdBy: manager.id });

    const ledger = await services.ledger.getClientLedger(client.id);

    expect(ledger.balance).toBe(80000);
    expect(ledger.entries).toHaveLength(4);
  });
});

describe('orders', () => {
  it('computes totals from the client price snapshot', async () => {
    const { services } = seededServices();

    const order = await services.orders.create(
      {
        clientId: client.id,
        items: [{ productId: productA.id, qty: 3 }],
        portions: 3,
        location: client.locations[0],
        contactPhone: client.contactPhone,
        paymentType: PaymentType.Transfer,
      },
      manager,
    );

    expect(order.items[0]).toMatchObject({ unitPrice: 32000, lineTotal: 96000 });
    expect(order.total).toBe(96000);
  });

  it('rejects illegal transitions with 409 and role mismatches with 403', async () => {
    const { services } = seededServices();
    const order = await services.orders.create(
      {
        clientId: client.id,
        items: [{ productId: productA.id, qty: 1 }],
        portions: 1,
        location: client.locations[0],
        contactPhone: client.contactPhone,
        paymentType: PaymentType.Cash,
      },
      manager,
    );

    await expect(services.orders.transition(order.id, { action: OrderAction.Ready }, kitchen)).rejects.toMatchObject({
      statusCode: 409,
    });
    await expect(services.orders.transition(order.id, { action: OrderAction.StartPrep }, manager)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it('fires Ready side effects once and reverses them once on cancel after Ready', async () => {
    const { services, poster } = seededServices();
    const order = await services.orders.create(
      {
        clientId: client.id,
        items: [{ productId: productA.id, qty: 2 }],
        portions: 2,
        location: client.locations[0],
        contactPhone: client.contactPhone,
        paymentType: PaymentType.Transfer,
      },
      manager,
    );

    await services.orders.transition(order.id, { action: OrderAction.StartPrep }, kitchen);
    const ready = await services.orders.transition(order.id, { action: OrderAction.Ready }, kitchen);
    await expect(services.orders.transition(order.id, { action: OrderAction.Ready }, kitchen)).rejects.toMatchObject({
      statusCode: 409,
    });

    expect(ready.status).toBe(OrderStatus.Ready);
    expect(poster.createdOrders).toHaveLength(1);
    expect((await services.ledger.getClientLedger(client.id)).entries.filter((e) => e.type === 'charge')).toHaveLength(1);

    const cancelled = await services.orders.transition(order.id, { action: OrderAction.Cancel }, manager);

    expect(cancelled.status).toBe(OrderStatus.Cancelled);
    expect(poster.voidedOrderIds).toEqual([ready.posterOrderId]);
    expect((await services.ledger.getClientLedger(client.id)).entries.filter((e) => e.method === 'reversal')).toHaveLength(1);
    expect((await services.ledger.getClientLedger(client.id)).balance).toBe(0);
  });

  it('assigns Yandex deeplinks and notifies own drivers', async () => {
    const { services, notified } = seededServices();
    const order = await services.orders.create(
      {
        clientId: client.id,
        items: [{ productId: productA.id, qty: 1 }],
        portions: 1,
        location: client.locations[0],
        contactPhone: client.contactPhone,
        paymentType: PaymentType.Cash,
      },
      manager,
    );
    await services.orders.transition(order.id, { action: OrderAction.StartPrep }, kitchen);
    await services.orders.transition(order.id, { action: OrderAction.Ready }, kitchen);

    const assignedYandex = await services.orders.transition(order.id, { action: OrderAction.Assign, deliveryType: DeliveryType.Yandex }, manager);
    expect(assignedYandex.yandexDeeplink).toContain('41.31');
    expect(assignedYandex.yandexDeeplink).toContain('69.27');

    const other = await services.orders.create(
      {
        clientId: client.id,
        items: [{ productId: productA.id, qty: 1 }],
        portions: 1,
        location: client.locations[0],
        contactPhone: client.contactPhone,
        paymentType: PaymentType.Cash,
      },
      manager,
    );
    await services.orders.transition(other.id, { action: OrderAction.StartPrep }, kitchen);
    await services.orders.transition(other.id, { action: OrderAction.Ready }, kitchen);
    await services.orders.transition(other.id, { action: OrderAction.Assign, deliveryType: DeliveryType.OwnDriver, driverId: driver.id }, manager);

    expect(notified.some((message) => message.startsWith(`${driver.id}:`))).toBe(true);
  });

  it('moves cash through manager and finance custody before finance closes with one payment', async () => {
    const { services, poster } = seededServices();
    const order = await services.orders.create(
      {
        clientId: client.id,
        items: [{ productId: productA.id, qty: 1 }],
        portions: 1,
        location: client.locations[0],
        contactPhone: client.contactPhone,
        paymentType: PaymentType.Cash,
      },
      manager,
    );

    await expect(services.orders.transition(order.id, { action: OrderAction.CashConfirm }, finance)).rejects.toMatchObject({
      statusCode: 409,
    });

    await services.orders.transition(order.id, { action: OrderAction.StartPrep }, kitchen);
    await services.orders.transition(order.id, { action: OrderAction.Ready }, kitchen);
    await services.orders.transition(order.id, { action: OrderAction.Assign, deliveryType: DeliveryType.OwnDriver, driverId: driver.id }, manager);
    await services.orders.transition(order.id, { action: OrderAction.Pickup }, driver);
    const delivered = await services.orders.transition(order.id, { action: OrderAction.Deliver }, driver);

    expect(delivered.status).toBe(OrderStatus.Delivered);
    expect(delivered.cashCollected).toBe(true);

    await expect(services.orders.transition(order.id, { action: OrderAction.CashToFinance }, driver)).rejects.toMatchObject({
      statusCode: 403,
    });
    await expect(services.orders.transition(order.id, { action: OrderAction.CashConfirm }, manager)).rejects.toMatchObject({
      statusCode: 403,
    });

    const withManager = await services.orders.transition(order.id, { action: OrderAction.CashToManager }, driver);
    const withFinance = await services.orders.transition(order.id, { action: OrderAction.CashToFinance }, manager);

    expect(withManager).toMatchObject({ status: OrderStatus.Delivered, cashCustody: CashCustody.Manager });
    expect(withFinance).toMatchObject({ status: OrderStatus.Delivered, cashCustody: CashCustody.Finance });
    expect(poster.createdOrders).toHaveLength(1);
    expect((await services.ledger.getClientLedger(client.id)).entries.filter((entry) => entry.type === 'payment')).toHaveLength(0);

    const closed = await services.orders.transition(order.id, { action: OrderAction.CashConfirm }, finance);
    await expect(services.orders.transition(order.id, { action: OrderAction.CashConfirm }, finance)).rejects.toMatchObject({
      statusCode: 409,
    });

    const ledger = await services.ledger.getClientLedger(client.id);

    expect(closed.status).toBe(OrderStatus.Closed);
    expect(closed.cashCustody).toBe(CashCustody.Finance);
    expect(ledger.entries.filter((entry) => entry.type === 'payment' && entry.method === PaymentType.Cash)).toHaveLength(1);
    expect(ledger.balance).toBe(0);
  });

  it('lets finance list all orders even when mine is requested', async () => {
    const { services } = seededServices();
    const otherManager: User = { id: 'u-other-manager', telegramId: '1005', role: Role.Manager, name: 'Other Manager' };
    await services.orders.create(
      {
        clientId: client.id,
        items: [{ productId: productA.id, qty: 1 }],
        portions: 1,
        location: client.locations[0],
        contactPhone: client.contactPhone,
        paymentType: PaymentType.Cash,
      },
      manager,
    );
    await services.orders.create(
      {
        clientId: client.id,
        items: [{ productId: productA.id, qty: 1 }],
        portions: 1,
        location: client.locations[0],
        contactPhone: client.contactPhone,
        paymentType: PaymentType.Cash,
      },
      otherManager,
    );

    const financeOrders = await services.orders.list({ mine: true }, finance);

    expect(financeOrders).toHaveLength(2);
  });
});

describe('auth', () => {
  it('resolves a user for valid Telegram initData and rejects tampered initData', async () => {
    const { services } = seededServices();
    const initData = createTelegramInitData(
      {
        id: 9999,
        first_name: 'Vali',
        username: 'vali',
      },
      '123456:test-token',
      1735689600,
    );

    const auth = await services.auth.loginTelegram(initData);

    expect(auth.user.telegramId).toBe('9999');
    expect(auth.token).toBeTruthy();
    await expect(services.auth.loginTelegram(initData.replace('Vali', 'Hacker'))).rejects.toMatchObject({ statusCode: 401 });
  });

  it('accepts dev:<userId> for existing users when dev auth is on', async () => {
    const { services } = seededServices({ devAuth: true });

    const auth = await services.auth.loginTelegram(`dev:${manager.id}`);

    expect(auth.user).toEqual(manager);
    expect(auth.token).toBeTruthy();
  });

  it('rejects dev:<userId> when dev auth is off', async () => {
    const { services } = seededServices({ devAuth: false });

    await expect(services.auth.loginTelegram(`dev:${manager.id}`)).rejects.toMatchObject({ statusCode: 401 });
  });
});

describe('server wiring', () => {
  it('uses the fake Poster client when POSTER_TOKEN is empty', async () => {
    const repo = new MemoryRepository();
    repo.seed({
      users: [manager, kitchen],
      clients: [client],
      products: [productA],
      clientPrices: [{ clientId: client.id, productId: productA.id, price: productA.basePrice }],
    });
    const { app, services } = await buildServer({
      repo,
      env: {
        botToken: '123456:test-token',
        databaseUrl: undefined,
        devAuth: false,
        jwtSecret: 'test-jwt-secret',
        port: 0,
        posterToken: '',
      },
    });

    try {
      const order = await services.orders.create(
        {
          clientId: client.id,
          items: [{ productId: productA.id, qty: 1 }],
          portions: 1,
          location: client.locations[0],
          contactPhone: client.contactPhone,
          paymentType: PaymentType.Transfer,
        },
        manager,
      );

      await services.orders.transition(order.id, { action: OrderAction.StartPrep }, kitchen);
      const ready = await services.orders.transition(order.id, { action: OrderAction.Ready }, kitchen);

      expect(ready.posterOrderId).toBe(`poster-${order.id}`);
    } finally {
      await app.close();
    }
  });
});

describe('poster sync', () => {
  it('upserts the same product once and updates its fields', async () => {
    const { services, repo } = seededServices();

    await services.posterSync.upsertPosterProduct({ posterId: '500', name: 'Tea', category: 'Drinks', basePrice: 8000, cost: 1500, unit: 'pot', isStopped: false });
    await services.posterSync.upsertPosterProduct({ posterId: '500', name: 'Green Tea', category: 'Drinks', basePrice: 9000, cost: 1700, unit: 'pot', isStopped: true });

    const products = await repo.listProducts();
    const synced = products.filter((product) => product.posterId === '500');

    expect(synced).toHaveLength(1);
    expect(synced[0]).toMatchObject({ name: 'Green Tea', basePrice: 9000, isStopped: true });
  });
});

describe('realtime', () => {
  it('sends active orders to kds and only assigned orders to the matching driver', () => {
    const hub = new RealtimeHub();
    const kdsMessages: string[] = [];
    const assignedDriverMessages: string[] = [];
    const otherDriverMessages: string[] = [];
    const socket = (messages: string[]) => ({ readyState: 1, OPEN: 1, send: (data: string) => void messages.push(data) });

    hub.subscribe(socket(kdsMessages), { subscribe: 'kds' });
    hub.subscribe(socket(assignedDriverMessages), { subscribe: 'driver', driverId: driver.id });
    hub.subscribe(socket(otherDriverMessages), { subscribe: 'driver', driverId: 'other-driver' });
    hub.broadcast({
      type: 'order.updated',
      order: {
        id: 'o1',
        clientId: client.id,
        clientName: client.name,
        createdBy: manager.id,
        status: OrderStatus.Assigned,
        items: [{ productId: productA.id, name: productA.name, qty: 1, unitPrice: 32000, lineTotal: 32000 }],
        total: 32000,
        paymentType: PaymentType.Cash,
        deliveryType: DeliveryType.OwnDriver,
        driverId: driver.id,
        location: client.locations[0],
        contactPhone: client.contactPhone,
        portions: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    });

    expect(kdsMessages).toHaveLength(1);
    expect(assignedDriverMessages).toHaveLength(1);
    expect(otherDriverMessages).toHaveLength(0);
  });
});
