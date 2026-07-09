import { describe, expect, it } from 'vitest';
import {
  CashCustody,
  DeliveryType,
  MoneyAccountType,
  MoneyMovementStatus,
  MoneyMovementType,
  OrderAction,
  OrderStatus,
  PayoutKind,
  PaymentType,
  Role,
  type Client,
  type Product,
  type User,
} from '@b2b/shared';
import { createAppServices } from '../src/app-services.js';
import { buildIncomingOrderPayload, FakePosterClient, HttpPosterClient, mapPosterProduct } from '../src/poster-sync/poster-client.js';
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
const owner: User = { id: 'u-owner', telegramId: '1005', role: Role.Owner, name: 'Owner' };
const warehouse: User = { id: 'u-warehouse', telegramId: '1006', role: Role.Warehouse, name: 'Warehouse' };

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
    users: [manager, kitchen, driver, finance, owner],
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

describe('menu sets', () => {
  it('creates a set and lists it with resolved component names', async () => {
    const repo = new MemoryRepository();
    repo.seed({ users: [manager, kitchen], clients: [client], products: [productA, productB] });
    const { app, services } = await buildServer({
      repo,
      env: {
        botToken: '123456:test-token',
        databaseUrl: undefined,
        devAuth: false,
        jwtSecret: 'test-jwt-secret',
        port: 0,
        posterToken: '',
        posterSpotId: 1,
      },
    });
    const managerToken = services.auth.issueToken(manager);
    const kitchenToken = services.auth.issueToken(kitchen);

    try {
      const created = await app.inject({
        method: 'POST',
        url: '/sets',
        headers: { authorization: `Bearer ${managerToken}` },
        payload: {
          name: 'Biznes-lanch',
          description: 'Osh + somsa',
          basePrice: 42000,
          components: [
            { productId: productA.id, qty: 1 },
            { productId: productB.id, qty: 2 },
          ],
        },
      });

      expect(created.statusCode).toBe(201);
      const listed = await app.inject({
        method: 'GET',
        url: '/sets',
        headers: { authorization: `Bearer ${kitchenToken}` },
      });

      expect(listed.statusCode).toBe(200);
      expect(listed.json()).toEqual([
        expect.objectContaining({
          id: created.json().id,
          name: 'Biznes-lanch',
          description: 'Osh + somsa',
          basePrice: 42000,
          active: true,
          components: [
            { productId: productA.id, name: productA.name, qty: 1 },
            { productId: productB.id, name: productB.name, qty: 2 },
          ],
        }),
      ]);
    } finally {
      await app.close();
    }
  });

  it('returns image for a created set in the set list', async () => {
    const repo = new MemoryRepository();
    repo.seed({ users: [manager, kitchen], clients: [client], products: [productA] });
    const { app, services } = await buildServer({
      repo,
      env: {
        botToken: '123456:test-token',
        databaseUrl: undefined,
        devAuth: false,
        jwtSecret: 'test-jwt-secret',
        port: 0,
        posterToken: '',
        posterSpotId: 1,
      },
    });
    const managerToken = services.auth.issueToken(manager);
    const kitchenToken = services.auth.issueToken(kitchen);
    const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB';

    try {
      const created = await app.inject({
        method: 'POST',
        url: '/sets',
        headers: { authorization: `Bearer ${managerToken}` },
        payload: {
          name: 'Image set',
          basePrice: 42000,
          image,
          components: [{ productId: productA.id, qty: 1 }],
        },
      });
      const listed = await app.inject({
        method: 'GET',
        url: '/sets',
        headers: { authorization: `Bearer ${kitchenToken}` },
      });

      expect(created.statusCode).toBe(201);
      expect(listed.statusCode).toBe(200);
      expect(listed.json()).toEqual([
        expect.objectContaining({
          id: created.json().id,
          image,
        }),
      ]);
    } finally {
      await app.close();
    }
  });

  it('sets client prices and lists unpriced active sets with clientPrice null', async () => {
    const repo = new MemoryRepository();
    repo.seed({ users: [manager, kitchen], clients: [client], products: [productA, productB] });
    const { app, services } = await buildServer({
      repo,
      env: {
        botToken: '123456:test-token',
        databaseUrl: undefined,
        devAuth: false,
        jwtSecret: 'test-jwt-secret',
        port: 0,
        posterToken: '',
        posterSpotId: 1,
      },
    });
    const managerToken = services.auth.issueToken(manager);
    const kitchenToken = services.auth.issueToken(kitchen);

    try {
      const first = await app.inject({
        method: 'POST',
        url: '/sets',
        headers: { authorization: `Bearer ${managerToken}` },
        payload: { name: 'Biznes-lanch', basePrice: 42000, components: [{ productId: productA.id, qty: 1 }] },
      });
      const second = await app.inject({
        method: 'POST',
        url: '/sets',
        headers: { authorization: `Bearer ${managerToken}` },
        payload: { name: 'Choy set', basePrice: 12000, components: [{ productId: productB.id, qty: 1 }] },
      });
      const price = await app.inject({
        method: 'PUT',
        url: `/clients/${client.id}/set-prices/${first.json().id}`,
        headers: { authorization: `Bearer ${managerToken}` },
        payload: { price: 39000 },
      });
      const offered = await app.inject({
        method: 'GET',
        url: `/clients/${client.id}/sets`,
        headers: { authorization: `Bearer ${kitchenToken}` },
      });

      expect(first.statusCode).toBe(201);
      expect(second.statusCode).toBe(201);
      expect(price.statusCode).toBe(200);
      expect(offered.statusCode).toBe(200);
      expect(offered.json().find((set: any) => set.id === first.json().id)?.clientPrice).toBe(39000);
      expect(offered.json().find((set: any) => set.id === second.json().id)?.clientPrice).toBeNull();
    } finally {
      await app.close();
    }
  });

  it('rejects non-manager set creation through HTTP routes', async () => {
    const repo = new MemoryRepository();
    repo.seed({ users: [kitchen], products: [productA] });
    const { app, services } = await buildServer({
      repo,
      env: {
        botToken: '123456:test-token',
        databaseUrl: undefined,
        devAuth: false,
        jwtSecret: 'test-jwt-secret',
        port: 0,
        posterToken: '',
        posterSpotId: 1,
      },
    });
    const kitchenToken = services.auth.issueToken(kitchen);

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/sets',
        headers: { authorization: `Bearer ${kitchenToken}` },
        payload: {
          name: 'Blocked set',
          basePrice: 1000,
          components: [{ productId: productA.id, qty: 1 }],
        },
      });

      expect(response.statusCode).toBe(403);
    } finally {
      await app.close();
    }
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

describe('money', () => {
  it('derives balances from approved income, expense, and transfers while tracking pending separately', async () => {
    const { services } = seededServices();

    const cashbox = await services.money.getOrCreateAccount(MoneyAccountType.Cashbox);
    const courier = await services.money.getOrCreateAccount(MoneyAccountType.Courier, driver.id);
    const managerAccount = await services.money.getOrCreateAccount(MoneyAccountType.Manager, manager.id);
    await services.money.createMovement({
      type: MoneyMovementType.Income,
      status: MoneyMovementStatus.Approved,
      toAccountId: cashbox.id,
      amount: 100000,
      category: 'Kassirdan qabul',
      createdBy: finance.id,
    });
    await services.money.createMovement({
      type: MoneyMovementType.Expense,
      status: MoneyMovementStatus.Approved,
      fromAccountId: cashbox.id,
      amount: 20000,
      category: 'Xarajat',
      createdBy: finance.id,
    });
    await services.money.createMovement({
      type: MoneyMovementType.Transfer,
      status: MoneyMovementStatus.Approved,
      fromAccountId: cashbox.id,
      toAccountId: courier.id,
      amount: 15000,
      createdBy: finance.id,
    });
    const pending = await services.money.createMovement({
      type: MoneyMovementType.Transfer,
      status: MoneyMovementStatus.Pending,
      fromAccountId: courier.id,
      toAccountId: managerAccount.id,
      amount: 5000,
      createdBy: driver.id,
    });

    let accounts = await services.money.getAccounts();
    expect(accounts.find((account) => account.id === cashbox.id)).toMatchObject({ balance: 65000, pendingIn: 0, pendingOut: 0 });
    expect(accounts.find((account) => account.id === courier.id)).toMatchObject({ balance: 15000, pendingIn: 0, pendingOut: 5000 });
    expect(accounts.find((account) => account.id === managerAccount.id)).toMatchObject({ balance: 0, pendingIn: 5000, pendingOut: 0 });

    await services.money.approveMovement(pending.id, finance.id);

    accounts = await services.money.getAccounts();
    expect(accounts.find((account) => account.id === courier.id)).toMatchObject({ balance: 10000, pendingOut: 0 });
    expect(accounts.find((account) => account.id === managerAccount.id)).toMatchObject({ balance: 5000, pendingIn: 0 });
  });

  it('creates idempotent order custody movements and approves the finance handoff on confirmation', async () => {
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

    await services.orders.transition(order.id, { action: OrderAction.StartPrep }, kitchen);
    await services.orders.transition(order.id, { action: OrderAction.Ready }, kitchen);
    await services.orders.transition(order.id, { action: OrderAction.Assign, deliveryType: DeliveryType.OwnDriver, driverId: driver.id }, manager);
    await services.orders.transition(order.id, { action: OrderAction.Pickup }, driver);
    await services.orders.transition(order.id, { action: OrderAction.Deliver }, driver);
    await services.orders.transition(order.id, { action: OrderAction.CashToManager }, driver);
    await services.orders.transition(order.id, { action: OrderAction.CashToFinance }, manager);

    let summary = await services.money.getSummary();
    expect(summary).toMatchObject({ cashbox: 0, drivers: 0, managers: 32000, pending: 32000 });

    await services.orders.transition(order.id, { action: OrderAction.CashConfirm }, finance);

    summary = await services.money.getSummary();
    const accounts = await services.money.getAccounts();
    const movements = await services.money.getMovements({ limit: 20 });
    const cashbox = accounts.find((account) => account.type === MoneyAccountType.Cashbox);
    const approvedTransfersIntoCashbox = movements.filter(
      (movement) =>
        movement.orderId === order.id &&
        movement.type === MoneyMovementType.Transfer &&
        movement.status === MoneyMovementStatus.Approved &&
        movement.toAccountId === cashbox?.id,
    );

    expect(summary).toMatchObject({ cashbox: 32000, drivers: 0, managers: 0, pending: 0 });
    expect(accounts.find((account) => account.type === MoneyAccountType.Courier && account.ownerUserId === driver.id)).toMatchObject({ balance: 0 });
    expect(accounts.find((account) => account.type === MoneyAccountType.Manager && account.ownerUserId === manager.id)).toMatchObject({ balance: 0 });
    expect(approvedTransfersIntoCashbox).toHaveLength(1);
  });

  it('records income and expenses through HTTP routes and rejects non-finance expenses', async () => {
    const repo = new MemoryRepository();
    repo.seed({ users: [manager, finance, owner] });
    const { app, services } = await buildServer({
      repo,
      env: {
        botToken: '123456:test-token',
        databaseUrl: undefined,
        devAuth: false,
        jwtSecret: 'test-jwt-secret',
        port: 0,
        posterToken: '',
        posterSpotId: 1,
      },
    });
    const financeToken = services.auth.issueToken(finance);
    const managerToken = services.auth.issueToken(manager);
    const ownerToken = services.auth.issueToken(owner);

    try {
      const income = await app.inject({
        method: 'POST',
        url: '/money/income',
        headers: { authorization: `Bearer ${financeToken}` },
        payload: { amount: 100000, category: 'Kassirdan qabul', note: 'shift close' },
      });
      const forbiddenExpense = await app.inject({
        method: 'POST',
        url: '/money/expense',
        headers: { authorization: `Bearer ${managerToken}` },
        payload: { amount: 5000, category: 'Xarajat' },
      });
      const expense = await app.inject({
        method: 'POST',
        url: '/money/expense',
        headers: { authorization: `Bearer ${financeToken}` },
        payload: { amount: 25000, category: 'Xarajat', counterparty: 'Bozor' },
      });
      const summary = await app.inject({
        method: 'GET',
        url: '/money/summary',
        headers: { authorization: `Bearer ${ownerToken}` },
      });

      expect(income.statusCode).toBe(201);
      expect(forbiddenExpense.statusCode).toBe(403);
      expect(expense.statusCode).toBe(201);
      expect(summary.statusCode).toBe(200);
      expect(summary.json()).toMatchObject({ cashbox: 75000, todayIn: 100000, todayOut: 25000 });
    } finally {
      await app.close();
    }
  });

  it('summarizes cashbox, driver, manager, pending, today, and by-driver totals', async () => {
    const { services } = seededServices();
    const cashbox = await services.money.getOrCreateAccount(MoneyAccountType.Cashbox);
    const courier = await services.money.getOrCreateAccount(MoneyAccountType.Courier, driver.id);
    const managerAccount = await services.money.getOrCreateAccount(MoneyAccountType.Manager, manager.id);

    await services.money.createMovement({
      type: MoneyMovementType.Income,
      status: MoneyMovementStatus.Approved,
      toAccountId: cashbox.id,
      amount: 50000,
      category: 'Kassirdan qabul',
      createdBy: finance.id,
    });
    await services.money.createMovement({
      type: MoneyMovementType.Expense,
      status: MoneyMovementStatus.Approved,
      fromAccountId: cashbox.id,
      amount: 7000,
      category: 'Xarajat',
      createdBy: finance.id,
    });
    await services.money.createMovement({
      type: MoneyMovementType.Income,
      status: MoneyMovementStatus.Approved,
      toAccountId: courier.id,
      amount: 20000,
      category: 'B2B naqd',
      createdBy: driver.id,
    });
    await services.money.createMovement({
      type: MoneyMovementType.Income,
      status: MoneyMovementStatus.Approved,
      toAccountId: managerAccount.id,
      amount: 3000,
      category: 'B2B naqd',
      createdBy: manager.id,
    });
    await services.money.createMovement({
      type: MoneyMovementType.Transfer,
      status: MoneyMovementStatus.Pending,
      fromAccountId: courier.id,
      toAccountId: cashbox.id,
      amount: 12000,
      createdBy: driver.id,
    });

    await expect(services.money.getSummary()).resolves.toEqual({
      cashbox: 43000,
      drivers: 20000,
      managers: 3000,
      pending: 12000,
      todayIn: 50000,
      todayOut: 7000,
      byDriver: [{ userId: driver.id, amount: 20000 }],
    });
  });
});

describe('staff payroll', () => {
  it('creates staff and lists salary with zero current-month payouts', async () => {
    const repo = new MemoryRepository();
    repo.seed({ users: [finance] });
    const { app, services } = await buildServer({
      repo,
      env: {
        botToken: '123456:test-token',
        databaseUrl: undefined,
        devAuth: false,
        jwtSecret: 'test-jwt-secret',
        port: 0,
        posterToken: '',
        posterSpotId: 1,
      },
    });
    const financeToken = services.auth.issueToken(finance);

    try {
      const created = await app.inject({
        method: 'POST',
        url: '/staff',
        headers: { authorization: `Bearer ${financeToken}` },
        payload: { name: 'Aziz', position: 'Oshpaz', salary: 4000000 },
      });
      const listed = await app.inject({
        method: 'GET',
        url: '/staff',
        headers: { authorization: `Bearer ${financeToken}` },
      });

      expect(created.statusCode).toBe(201);
      expect(created.json()).toMatchObject({
        name: 'Aziz',
        position: 'Oshpaz',
        salary: 4000000,
        active: true,
        advancesThisMonth: 0,
        paidThisMonth: 0,
        balance: 4000000,
      });
      expect(listed.statusCode).toBe(200);
      expect(listed.json()).toEqual([created.json()]);
    } finally {
      await app.close();
    }
  });

  it('pays staff advances and salary through approved cashbox expense movements', async () => {
    const repo = new MemoryRepository();
    repo.seed({ users: [finance] });
    const { app, services } = await buildServer({
      repo,
      env: {
        botToken: '123456:test-token',
        databaseUrl: undefined,
        devAuth: false,
        jwtSecret: 'test-jwt-secret',
        port: 0,
        posterToken: '',
        posterSpotId: 1,
      },
    });
    const financeToken = services.auth.issueToken(finance);

    try {
      await services.money.recordIncome({ amount: 4000000, category: 'Kassirdan qabul' }, finance.id);
      const cashbox = await services.money.getOrCreateAccount(MoneyAccountType.Cashbox);
      const created = await app.inject({
        method: 'POST',
        url: '/staff',
        headers: { authorization: `Bearer ${financeToken}` },
        payload: { name: 'Aziz', position: 'Oshpaz', salary: 4000000 },
      });
      const staff = created.json();

      const advance = await app.inject({
        method: 'POST',
        url: `/staff/${staff.id}/pay`,
        headers: { authorization: `Bearer ${financeToken}` },
        payload: { kind: PayoutKind.Advance, amount: 1000000, note: 'July avans' },
      });
      const afterAdvanceAccounts = await services.money.getAccounts();
      const afterAdvanceStaff = await app.inject({
        method: 'GET',
        url: '/staff',
        headers: { authorization: `Bearer ${financeToken}` },
      });

      expect(advance.statusCode).toBe(201);
      expect(advance.json()).toMatchObject({
        type: MoneyMovementType.Expense,
        status: MoneyMovementStatus.Approved,
        fromAccountId: cashbox.id,
        amount: 1000000,
        category: 'Avans',
        note: 'July avans',
        counterparty: 'Aziz',
        staffId: staff.id,
        createdBy: finance.id,
        approvedBy: finance.id,
      });
      expect(afterAdvanceAccounts.find((account) => account.id === cashbox.id)).toMatchObject({ balance: 3000000 });
      expect(afterAdvanceStaff.json()).toMatchObject([
        {
          id: staff.id,
          advancesThisMonth: 1000000,
          paidThisMonth: 1000000,
          balance: 3000000,
        },
      ]);

      const salary = await app.inject({
        method: 'POST',
        url: `/staff/${staff.id}/pay`,
        headers: { authorization: `Bearer ${financeToken}` },
        payload: { kind: PayoutKind.Salary, amount: 3000000 },
      });
      const afterSalaryStaff = await app.inject({
        method: 'GET',
        url: '/staff',
        headers: { authorization: `Bearer ${financeToken}` },
      });

      expect(salary.statusCode).toBe(201);
      expect(salary.json()).toMatchObject({ category: 'Oylik', staffId: staff.id, amount: 3000000 });
      expect(afterSalaryStaff.json()).toMatchObject([
        {
          id: staff.id,
          advancesThisMonth: 1000000,
          paidThisMonth: 4000000,
          balance: 0,
        },
      ]);
    } finally {
      await app.close();
    }
  });

  it('rejects non-finance staff reads and payouts', async () => {
    const repo = new MemoryRepository();
    repo.seed({ users: [manager, finance] });
    const { app, services } = await buildServer({
      repo,
      env: {
        botToken: '123456:test-token',
        databaseUrl: undefined,
        devAuth: false,
        jwtSecret: 'test-jwt-secret',
        port: 0,
        posterToken: '',
        posterSpotId: 1,
      },
    });
    const financeToken = services.auth.issueToken(finance);
    const managerToken = services.auth.issueToken(manager);

    try {
      const created = await app.inject({
        method: 'POST',
        url: '/staff',
        headers: { authorization: `Bearer ${financeToken}` },
        payload: { name: 'Aziz', position: 'Oshpaz', salary: 4000000 },
      });
      const staff = created.json();
      const forbiddenList = await app.inject({
        method: 'GET',
        url: '/staff',
        headers: { authorization: `Bearer ${managerToken}` },
      });
      const forbiddenPay = await app.inject({
        method: 'POST',
        url: `/staff/${staff.id}/pay`,
        headers: { authorization: `Bearer ${managerToken}` },
        payload: { kind: PayoutKind.Advance, amount: 1000000 },
      });

      expect(forbiddenList.statusCode).toBe(403);
      expect(forbiddenPay.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });
});

describe('inventory', () => {
  it('creates ingredients and lists active ingredients with derived low-stock state', async () => {
    const repo = new MemoryRepository();
    repo.seed({ users: [warehouse] });
    const { app, services } = await buildServer({
      repo,
      env: {
        botToken: '123456:test-token',
        databaseUrl: undefined,
        devAuth: false,
        jwtSecret: 'test-jwt-secret',
        port: 0,
        posterToken: '',
        posterSpotId: 1,
      },
    });
    const warehouseToken = services.auth.issueToken(warehouse);

    try {
      const meat = await app.inject({
        method: 'POST',
        url: '/ingredients',
        headers: { authorization: `Bearer ${warehouseToken}` },
        payload: { name: "Go'sht", unit: 'kg', stock: 8, minStock: 15, supplier: 'Halol Meat' },
      });
      const rice = await app.inject({
        method: 'POST',
        url: '/ingredients',
        headers: { authorization: `Bearer ${warehouseToken}` },
        payload: { name: 'Guruch', unit: 'kg', stock: 40, minStock: 30, supplier: 'Oziq Baza' },
      });

      const listed = await app.inject({
        method: 'GET',
        url: '/ingredients',
        headers: { authorization: `Bearer ${warehouseToken}` },
      });

      expect(meat.statusCode).toBe(201);
      expect(rice.statusCode).toBe(201);
      expect(listed.statusCode).toBe(200);
      expect(listed.json()).toMatchObject([
        { name: "Go'sht", stock: 8, minStock: 15, isLow: true, active: true },
        { name: 'Guruch', stock: 40, minStock: 30, isLow: false, active: true },
      ]);
    } finally {
      await app.close();
    }
  });

  it('adjusts stock up and down while clamping at zero', async () => {
    const repo = new MemoryRepository();
    repo.seed({ users: [warehouse] });
    const { app, services } = await buildServer({
      repo,
      env: {
        botToken: '123456:test-token',
        databaseUrl: undefined,
        devAuth: false,
        jwtSecret: 'test-jwt-secret',
        port: 0,
        posterToken: '',
        posterSpotId: 1,
      },
    });
    const warehouseToken = services.auth.issueToken(warehouse);

    try {
      const created = await app.inject({
        method: 'POST',
        url: '/ingredients',
        headers: { authorization: `Bearer ${warehouseToken}` },
        payload: { name: 'Sabzi', unit: 'kg', stock: 5, minStock: 12, supplier: 'Dehqon Bozor' },
      });
      const ingredient = created.json();

      const received = await app.inject({
        method: 'POST',
        url: `/ingredients/${ingredient.id}/adjust`,
        headers: { authorization: `Bearer ${warehouseToken}` },
        payload: { delta: 4, reason: 'kirim' },
      });
      const used = await app.inject({
        method: 'POST',
        url: `/ingredients/${ingredient.id}/adjust`,
        headers: { authorization: `Bearer ${warehouseToken}` },
        payload: { delta: -3, reason: 'chiqim' },
      });
      const clamped = await app.inject({
        method: 'POST',
        url: `/ingredients/${ingredient.id}/adjust`,
        headers: { authorization: `Bearer ${warehouseToken}` },
        payload: { delta: -99, reason: 'write-off' },
      });

      expect(received.statusCode).toBe(200);
      expect(received.json()).toMatchObject({ stock: 9, isLow: true });
      expect(used.statusCode).toBe(200);
      expect(used.json()).toMatchObject({ stock: 6, isLow: true });
      expect(clamped.statusCode).toBe(200);
      expect(clamped.json()).toMatchObject({ stock: 0, isLow: true });
    } finally {
      await app.close();
    }
  });

  it('purchases ingredients by increasing stock, setting unit cost, and recording a cashbox expense', async () => {
    const repo = new MemoryRepository();
    repo.seed({ users: [warehouse, finance] });
    const { app, services } = await buildServer({
      repo,
      env: {
        botToken: '123456:test-token',
        databaseUrl: undefined,
        devAuth: false,
        jwtSecret: 'test-jwt-secret',
        port: 0,
        posterToken: '',
        posterSpotId: 1,
      },
    });
    const warehouseToken = services.auth.issueToken(warehouse);

    try {
      await services.money.recordIncome({ amount: 100000, category: 'Kassirdan qabul' }, finance.id);
      const cashbox = await services.money.getOrCreateAccount(MoneyAccountType.Cashbox);
      const created = await app.inject({
        method: 'POST',
        url: '/ingredients',
        headers: { authorization: `Bearer ${warehouseToken}` },
        payload: { name: 'Yog', unit: 'litr', stock: 3, minStock: 10, supplier: 'Oziq Baza' },
      });
      const ingredient = created.json();

      const purchased = await app.inject({
        method: 'POST',
        url: `/ingredients/${ingredient.id}/purchase`,
        headers: { authorization: `Bearer ${warehouseToken}` },
        payload: { qty: 7, price: 35000 },
      });
      const accounts = await services.money.getAccounts();
      const movements = await services.money.getMovements({ limit: 10 });
      const expense = movements.find((movement) => movement.category === 'Bozorlik');

      expect(purchased.statusCode).toBe(200);
      expect(purchased.json()).toMatchObject({ id: ingredient.id, stock: 10, price: 5000 });
      expect(expense).toMatchObject({
        type: MoneyMovementType.Expense,
        status: MoneyMovementStatus.Approved,
        fromAccountId: cashbox.id,
        amount: 35000,
        category: 'Bozorlik',
        counterparty: 'Oziq Baza',
        note: 'Yog',
        createdBy: warehouse.id,
        approvedBy: warehouse.id,
      });
      expect(accounts.find((account) => account.id === cashbox.id)).toMatchObject({ balance: 65000 });
    } finally {
      await app.close();
    }
  });

  it('requires warehouse role for ingredient purchases', async () => {
    const repo = new MemoryRepository();
    repo.seed({ users: [manager, warehouse] });
    const { app, services } = await buildServer({
      repo,
      env: {
        botToken: '123456:test-token',
        databaseUrl: undefined,
        devAuth: false,
        jwtSecret: 'test-jwt-secret',
        port: 0,
        posterToken: '',
        posterSpotId: 1,
      },
    });
    const managerToken = services.auth.issueToken(manager);
    const warehouseToken = services.auth.issueToken(warehouse);

    try {
      const created = await app.inject({
        method: 'POST',
        url: '/ingredients',
        headers: { authorization: `Bearer ${warehouseToken}` },
        payload: { name: 'Kartoshka', unit: 'kg', stock: 5, minStock: 20, supplier: 'Dehqon Bozor' },
      });
      const ingredient = created.json();

      const forbiddenPurchase = await app.inject({
        method: 'POST',
        url: `/ingredients/${ingredient.id}/purchase`,
        headers: { authorization: `Bearer ${managerToken}` },
        payload: { qty: 7, price: 35000 },
      });

      expect(forbiddenPurchase.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });

  it('purchases ingredients with zero price without recording a cashbox expense', async () => {
    const repo = new MemoryRepository();
    repo.seed({ users: [warehouse] });
    const { app, services } = await buildServer({
      repo,
      env: {
        botToken: '123456:test-token',
        databaseUrl: undefined,
        devAuth: false,
        jwtSecret: 'test-jwt-secret',
        port: 0,
        posterToken: '',
        posterSpotId: 1,
      },
    });
    const warehouseToken = services.auth.issueToken(warehouse);

    try {
      const created = await app.inject({
        method: 'POST',
        url: '/ingredients',
        headers: { authorization: `Bearer ${warehouseToken}` },
        payload: { name: 'Tuz', unit: 'kg', stock: 2, minStock: 5, supplier: 'Oziq Baza' },
      });
      const ingredient = created.json();

      const purchased = await app.inject({
        method: 'POST',
        url: `/ingredients/${ingredient.id}/purchase`,
        headers: { authorization: `Bearer ${warehouseToken}` },
        payload: { qty: 3, price: 0 },
      });
      const movements = await services.money.getMovements({ limit: 10 });

      expect(purchased.statusCode).toBe(200);
      expect(purchased.json()).toMatchObject({ id: ingredient.id, stock: 5, price: 0 });
      expect(movements.filter((movement) => movement.category === 'Bozorlik')).toHaveLength(0);
    } finally {
      await app.close();
    }
  });

  it('requires warehouse role for writes while allowing manager and owner reads', async () => {
    const repo = new MemoryRepository();
    repo.seed({ users: [manager, owner, warehouse] });
    const { app, services } = await buildServer({
      repo,
      env: {
        botToken: '123456:test-token',
        databaseUrl: undefined,
        devAuth: false,
        jwtSecret: 'test-jwt-secret',
        port: 0,
        posterToken: '',
        posterSpotId: 1,
      },
    });
    const managerToken = services.auth.issueToken(manager);
    const ownerToken = services.auth.issueToken(owner);
    const warehouseToken = services.auth.issueToken(warehouse);

    try {
      const forbiddenCreate = await app.inject({
        method: 'POST',
        url: '/ingredients',
        headers: { authorization: `Bearer ${managerToken}` },
        payload: { name: 'Un', unit: 'kg', stock: 25, minStock: 20, supplier: 'Oziq Baza' },
      });
      const created = await app.inject({
        method: 'POST',
        url: '/ingredients',
        headers: { authorization: `Bearer ${warehouseToken}` },
        payload: { name: 'Un', unit: 'kg', stock: 25, minStock: 20, supplier: 'Oziq Baza' },
      });
      const ingredient = created.json();
      const forbiddenAdjust = await app.inject({
        method: 'POST',
        url: `/ingredients/${ingredient.id}/adjust`,
        headers: { authorization: `Bearer ${managerToken}` },
        payload: { delta: 1 },
      });
      const managerList = await app.inject({
        method: 'GET',
        url: '/ingredients',
        headers: { authorization: `Bearer ${managerToken}` },
      });
      const ownerList = await app.inject({
        method: 'GET',
        url: '/ingredients',
        headers: { authorization: `Bearer ${ownerToken}` },
      });

      expect(forbiddenCreate.statusCode).toBe(403);
      expect(created.statusCode).toBe(201);
      expect(forbiddenAdjust.statusCode).toBe(403);
      expect(managerList.statusCode).toBe(200);
      expect(ownerList.statusCode).toBe(200);
    } finally {
      await app.close();
    }
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

  it('computes set line totals from the client set price and rejects unoffered sets', async () => {
    const { services } = seededServices();
    const offeredSet = await services.menuSets.create({
      name: 'Biznes-lanch',
      basePrice: 42000,
      components: [
        { productId: productA.id, qty: 1 },
        { productId: productB.id, qty: 1 },
      ],
    });
    const unofferedSet = await services.menuSets.create({
      name: 'Unpriced lanch',
      basePrice: 50000,
      components: [{ productId: productA.id, qty: 1 }],
    });
    await services.menuSets.setClientPrice(client.id, offeredSet.id, 39000);

    const order = await services.orders.create(
      {
        clientId: client.id,
        items: [{ setId: offeredSet.id, qty: 3 }],
        portions: 3,
        location: client.locations[0],
        contactPhone: client.contactPhone,
        paymentType: PaymentType.Transfer,
      },
      manager,
    );

    expect(order.items[0]).toMatchObject({ setId: offeredSet.id, name: 'Biznes-lanch', qty: 3, unitPrice: 39000, lineTotal: 117000 });
    expect(order.total).toBe(117000);
    await expect(
      services.orders.create(
        {
          clientId: client.id,
          items: [{ setId: unofferedSet.id, qty: 1 }],
          portions: 1,
          location: client.locations[0],
          contactPhone: client.contactPhone,
          paymentType: PaymentType.Transfer,
        },
        manager,
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('expands set lines into component Poster products at Ready writeback', async () => {
    const { services, poster } = seededServices();
    const menuSet = await services.menuSets.create({
      name: 'Biznes-lanch',
      basePrice: 42000,
      components: [
        { productId: productA.id, qty: 1 },
        { productId: productB.id, qty: 2 },
      ],
    });
    await services.menuSets.setClientPrice(client.id, menuSet.id, 39000);
    const order = await services.orders.create(
      {
        clientId: client.id,
        items: [{ setId: menuSet.id, qty: 3 }],
        portions: 3,
        location: client.locations[0],
        contactPhone: client.contactPhone,
        paymentType: PaymentType.Transfer,
      },
      manager,
    );

    await services.orders.transition(order.id, { action: OrderAction.StartPrep }, kitchen);
    await services.orders.transition(order.id, { action: OrderAction.Ready }, kitchen);

    expect(poster.createdOrders[0].items).toEqual([
      expect.objectContaining({ posterProductId: productA.posterId, qty: 3, unitPrice: 0, lineTotal: 0 }),
      expect.objectContaining({ posterProductId: productB.posterId, qty: 6, unitPrice: 0, lineTotal: 0 }),
    ]);
    expect(buildIncomingOrderPayload(poster.createdOrders[0], 7).products).toEqual([
      { product_id: productA.posterId, count: 3, price: 0 },
      { product_id: productB.posterId, count: 6, price: 0 },
    ]);
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
        posterSpotId: 1,
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
  it('fetches goods and tech cards from Poster full sync', async () => {
    const originalFetch = globalThis.fetch;
    const requestedTypes: string[] = [];
    globalThis.fetch = (async (url: string | URL | Request) => {
      const parsed = new URL(String(url));
      const type = parsed.searchParams.get('type') ?? '';
      requestedTypes.push(type);
      return new Response(
        JSON.stringify({
          response: [
            {
              product_id: type === 'batchtickets' ? 202 : 101,
              product_name: type === 'batchtickets' ? 'Tech Osh' : 'Osh',
              category_name: type,
              price: { '1': type === 'batchtickets' ? '4500000' : '3500000' },
              cost: '1000000',
              unit: 'portion',
              hidden: type === 'batchtickets' ? '1' : '0',
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as typeof fetch;

    try {
      const products = await new HttpPosterClient('token', 1).getProducts();

      expect(requestedTypes).toEqual(['products', 'batchtickets']);
      expect(products).toEqual([
        expect.objectContaining({ posterId: '101', name: 'Osh', basePrice: 35000, isStopped: false }),
        expect.objectContaining({ posterId: '202', name: 'Tech Osh', basePrice: 45000, isStopped: true }),
      ]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('maps Poster products from kopecks and hidden flags', () => {
    expect(
      mapPosterProduct(
        {
          product_id: 101,
          product_name: 'Osh',
          category_name: 'Main',
          unit: 'portion',
          price: { '1': '30000' },
          cost: 18000,
          hidden: '0',
        },
        1,
      ),
    ).toMatchObject({
      posterId: '101',
      name: 'Osh',
      category: 'Main',
      basePrice: 300,
      cost: 180,
      unit: 'portion',
      isStopped: false,
    });

    expect(mapPosterProduct({ product_id: 102, price: { '1': '12000' }, cost: 5000, hidden: '1' }, 1).isStopped).toBe(true);
  });

  it('builds incoming order payload with top-level spot and Poster product ids', () => {
    const payload = buildIncomingOrderPayload(
      {
        id: 'o1',
        clientId: client.id,
        clientName: client.name,
        createdBy: manager.id,
        status: OrderStatus.Ready,
        items: [
          { productId: productA.id, posterProductId: productA.posterId, name: productA.name, qty: 2, unitPrice: 320, lineTotal: 640 },
          { productId: productB.id, posterProductId: productB.posterId, name: productB.name, qty: 1, unitPrice: 125.5, lineTotal: 125.5 },
        ],
        total: 765.5,
        paymentType: PaymentType.Transfer,
        location: client.locations[0],
        contactPhone: client.contactPhone,
        portions: 2,
        notes: 'No onion',
        createdAt: '2026-07-09T00:00:00.000Z',
        updatedAt: '2026-07-09T00:00:00.000Z',
      },
      7,
    );

    expect(payload).toEqual({
      spot_id: 7,
      phone: client.contactPhone,
      first_name: client.name,
      comment: 'No onion',
      products: [
        { product_id: productA.posterId, count: 2, price: 32000 },
        { product_id: productB.posterId, count: 1, price: 12550 },
      ],
    });
    expect(payload).not.toHaveProperty('order');
  });

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
