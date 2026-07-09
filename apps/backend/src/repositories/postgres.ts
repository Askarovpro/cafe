import { eq } from 'drizzle-orm';
import {
  CashCustody,
  DeliveryType,
  MoneyAccountType,
  MoneyMovementStatus,
  MoneyMovementType,
  OrderStatus,
  PaymentType,
  Role,
  type Client,
  type ClientLocation,
  type ClientPrice,
  type LedgerEntry,
  type Order,
  type OrderItem,
  type Product,
  type User,
} from '@b2b/shared';
import { createDrizzle } from '../db/client.js';
import * as schema from '../db/schema.js';
import { id } from '../ids.js';
import type { AppRepository, ProductUpsert, StoredIngredient, StoredMoneyAccount, StoredMoneyMovement, StoredStaff } from './types.js';

type Db = ReturnType<typeof createDrizzle>;
type UserRow = typeof schema.users.$inferSelect;
type ClientRow = typeof schema.clients.$inferSelect;
type ProductRow = typeof schema.products.$inferSelect;
type OrderRow = typeof schema.orders.$inferSelect;
type LedgerRow = typeof schema.ledgerEntries.$inferSelect;
type MoneyAccountRow = typeof schema.moneyAccounts.$inferSelect;
type MoneyMovementRow = typeof schema.moneyMovements.$inferSelect;
type StaffRow = typeof schema.staff.$inferSelect;
type IngredientRow = typeof schema.ingredients.$inferSelect;

export class PostgresRepository implements AppRepository {
  constructor(private readonly db: Db) {}

  async findUserByTelegramId(telegramId: string): Promise<User | undefined> {
    const [row] = await this.db.select().from(schema.users).where(eq(schema.users.telegramId, telegramId)).limit(1);
    return row ? userFromRow(row) : undefined;
  }

  async findUserById(userId: string): Promise<User | undefined> {
    const [row] = await this.db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    return row ? userFromRow(row) : undefined;
  }

  async createUser(user: User): Promise<User> {
    const [row] = await this.db.insert(schema.users).values(user).returning();
    return userFromRow(row);
  }

  async listProducts(): Promise<Product[]> {
    return (await this.db.select().from(schema.products)).map(productFromRow);
  }

  async findProductById(productId: string): Promise<Product | undefined> {
    const [row] = await this.db.select().from(schema.products).where(eq(schema.products.id, productId)).limit(1);
    return row ? productFromRow(row) : undefined;
  }

  async upsertProduct(product: ProductUpsert): Promise<Product> {
    const productId = id('product');
    const [row] = await this.db
      .insert(schema.products)
      .values({ id: productId, ...product, syncedAt: new Date() })
      .onConflictDoUpdate({
        target: schema.products.posterId,
        set: {
          name: product.name,
          category: product.category,
          basePrice: product.basePrice,
          cost: product.cost,
          unit: product.unit,
          isStopped: product.isStopped,
          syncedAt: new Date(),
        },
      })
      .returning();
    return productFromRow(row);
  }

  async listClients(): Promise<Client[]> {
    const rows = await this.db.select().from(schema.clients);
    return Promise.all(rows.map((row) => this.clientFromRow(row)));
  }

  async findClientById(clientId: string): Promise<Client | undefined> {
    const [row] = await this.db.select().from(schema.clients).where(eq(schema.clients.id, clientId)).limit(1);
    return row ? this.clientFromRow(row) : undefined;
  }

  async createClient(client: Omit<Client, 'balance'>): Promise<Client> {
    const [row] = await this.db.insert(schema.clients).values(client).returning();
    return this.clientFromRow(row);
  }

  async updateClient(clientId: string, patch: Partial<Omit<Client, 'id' | 'balance'>>): Promise<Client> {
    const [row] = await this.db.update(schema.clients).set(patch).where(eq(schema.clients.id, clientId)).returning();
    return this.clientFromRow(row);
  }

  async listClientPrices(clientId: string): Promise<ClientPrice[]> {
    const rows = await this.db.select().from(schema.clientPrices).where(eq(schema.clientPrices.clientId, clientId));
    return rows.map((row) => ({ productId: row.productId, price: row.price }));
  }

  async findClientPrice(clientId: string, productId: string): Promise<ClientPrice | undefined> {
    const price = (await this.listClientPrices(clientId)).find((row) => row.productId === productId);
    return price;
  }

  async setClientPrice(clientId: string, price: ClientPrice): Promise<ClientPrice> {
    const [row] = await this.db
      .insert(schema.clientPrices)
      .values({ clientId, productId: price.productId, price: price.price })
      .onConflictDoUpdate({
        target: [schema.clientPrices.clientId, schema.clientPrices.productId],
        set: { price: price.price },
      })
      .returning();
    return { productId: row.productId, price: row.price };
  }

  async replaceClientPrices(clientId: string, prices: ClientPrice[]): Promise<ClientPrice[]> {
    await this.db.delete(schema.clientPrices).where(eq(schema.clientPrices.clientId, clientId));
    if (!prices.length) return [];
    const rows = await this.db
      .insert(schema.clientPrices)
      .values(prices.map((price) => ({ clientId, productId: price.productId, price: price.price })))
      .returning();
    return rows.map((row) => ({ productId: row.productId, price: row.price }));
  }

  async listLedgerEntries(clientId: string): Promise<LedgerEntry[]> {
    return (await this.db.select().from(schema.ledgerEntries).where(eq(schema.ledgerEntries.clientId, clientId))).map(ledgerFromRow);
  }

  async appendLedgerEntry(entry: LedgerEntry): Promise<LedgerEntry> {
    const [row] = await this.db.insert(schema.ledgerEntries).values({ ...entry, createdAt: new Date(entry.createdAt) }).returning();
    return ledgerFromRow(row);
  }

  async findLedgerEntry(query: { orderId: string; type: LedgerEntry['type']; method?: string }): Promise<LedgerEntry | undefined> {
    const rows = (await this.db.select().from(schema.ledgerEntries).where(eq(schema.ledgerEntries.orderId, query.orderId))).map(ledgerFromRow);
    return rows.find((entry) => entry.type === query.type && (query.method == null || entry.method === query.method));
  }

  async createOrder(order: Order): Promise<Order> {
    const [row] = await this.db.insert(schema.orders).values(orderToRow(order)).returning();
    return orderFromRow(row);
  }

  async findOrderById(orderId: string): Promise<Order | undefined> {
    const [row] = await this.db.select().from(schema.orders).where(eq(schema.orders.id, orderId)).limit(1);
    return row ? orderFromRow(row) : undefined;
  }

  async updateOrder(order: Order): Promise<Order> {
    const [row] = await this.db.update(schema.orders).set(orderToRow(order)).where(eq(schema.orders.id, order.id)).returning();
    return orderFromRow(row);
  }

  async listOrders(query: { status?: string; createdBy?: string; driverId?: string; activeOnly?: boolean } = {}): Promise<Order[]> {
    const rows = (await this.db.select().from(schema.orders)).map(orderFromRow);
    return rows
      .filter((order) => !query.status || order.status === query.status)
      .filter((order) => !query.createdBy || order.createdBy === query.createdBy)
      .filter((order) => !query.driverId || order.driverId === query.driverId)
      .filter((order) => !query.activeOnly || ![OrderStatus.Closed, OrderStatus.Cancelled].includes(order.status));
  }

  async listMoneyAccounts(): Promise<StoredMoneyAccount[]> {
    return (await this.db.select().from(schema.moneyAccounts)).map(moneyAccountFromRow);
  }

  async findMoneyAccount(query: { type: StoredMoneyAccount['type']; ownerUserId?: string }): Promise<StoredMoneyAccount | undefined> {
    const rows = (await this.db.select().from(schema.moneyAccounts).where(eq(schema.moneyAccounts.type, query.type))).map(moneyAccountFromRow);
    return rows.find((account) => query.ownerUserId == null || account.ownerUserId === query.ownerUserId);
  }

  async createMoneyAccount(account: StoredMoneyAccount): Promise<StoredMoneyAccount> {
    const [row] = await this.db
      .insert(schema.moneyAccounts)
      .values({
        id: account.id,
        type: account.type,
        name: account.name,
        ownerUserId: account.ownerUserId,
        createdAt: new Date(account.createdAt),
      })
      .returning();
    return moneyAccountFromRow(row);
  }

  async listMoneyMovements(query: { orderId?: string; limit?: number } = {}): Promise<StoredMoneyMovement[]> {
    let rows = (await this.db.select().from(schema.moneyMovements)).map(moneyMovementFromRow);
    if (query.orderId) rows = rows.filter((movement) => movement.orderId === query.orderId);
    rows = rows.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    return typeof query.limit === 'number' ? rows.slice(0, query.limit) : rows;
  }

  async findMoneyMovementById(movementId: string): Promise<StoredMoneyMovement | undefined> {
    const [row] = await this.db.select().from(schema.moneyMovements).where(eq(schema.moneyMovements.id, movementId)).limit(1);
    return row ? moneyMovementFromRow(row) : undefined;
  }

  async createMoneyMovement(movement: StoredMoneyMovement): Promise<StoredMoneyMovement> {
    const [row] = await this.db.insert(schema.moneyMovements).values(moneyMovementToRow(movement)).returning();
    return moneyMovementFromRow(row);
  }

  async updateMoneyMovement(movement: StoredMoneyMovement): Promise<StoredMoneyMovement> {
    const [row] = await this.db
      .update(schema.moneyMovements)
      .set(moneyMovementToRow(movement))
      .where(eq(schema.moneyMovements.id, movement.id))
      .returning();
    return moneyMovementFromRow(row);
  }

  async listStaff(): Promise<StoredStaff[]> {
    return (await this.db.select().from(schema.staff)).map(staffFromRow);
  }

  async findStaffById(staffId: string): Promise<StoredStaff | undefined> {
    const [row] = await this.db.select().from(schema.staff).where(eq(schema.staff.id, staffId)).limit(1);
    return row ? staffFromRow(row) : undefined;
  }

  async createStaff(staff: StoredStaff): Promise<StoredStaff> {
    const [row] = await this.db
      .insert(schema.staff)
      .values({
        id: staff.id,
        name: staff.name,
        position: staff.position,
        salary: staff.salary,
        active: staff.active,
        createdAt: new Date(staff.createdAt),
      })
      .returning();
    return staffFromRow(row);
  }

  async updateStaff(staffId: string, patch: Partial<Omit<StoredStaff, 'id' | 'createdAt'>>): Promise<StoredStaff> {
    const [row] = await this.db.update(schema.staff).set(patch).where(eq(schema.staff.id, staffId)).returning();
    return staffFromRow(row);
  }

  async listIngredients(query: { activeOnly?: boolean } = {}): Promise<StoredIngredient[]> {
    let rows = (await this.db.select().from(schema.ingredients)).map(ingredientFromRow);
    if (query.activeOnly) rows = rows.filter((ingredient) => ingredient.active);
    return rows;
  }

  async findIngredientById(ingredientId: string): Promise<StoredIngredient | undefined> {
    const [row] = await this.db.select().from(schema.ingredients).where(eq(schema.ingredients.id, ingredientId)).limit(1);
    return row ? ingredientFromRow(row) : undefined;
  }

  async createIngredient(ingredient: StoredIngredient): Promise<StoredIngredient> {
    const [row] = await this.db
      .insert(schema.ingredients)
      .values({
        id: ingredient.id,
        name: ingredient.name,
        unit: ingredient.unit,
        stock: ingredient.stock,
        minStock: ingredient.minStock,
        supplier: ingredient.supplier,
        active: ingredient.active,
        createdAt: new Date(ingredient.createdAt),
      })
      .returning();
    return ingredientFromRow(row);
  }

  async updateIngredient(ingredientId: string, patch: Partial<Omit<StoredIngredient, 'id' | 'createdAt'>>): Promise<StoredIngredient> {
    const [row] = await this.db.update(schema.ingredients).set(patch).where(eq(schema.ingredients.id, ingredientId)).returning();
    return ingredientFromRow(row);
  }

  private async clientFromRow(row: ClientRow): Promise<Client> {
    const entries = await this.listLedgerEntries(row.id);
    const balance = entries.reduce((sum, entry) => sum + (entry.type === 'charge' ? entry.amount : -entry.amount), 0);
    return {
      id: row.id,
      name: row.name,
      contactName: row.contactName,
      contactPhone: row.contactPhone,
      locations: row.locations as ClientLocation[],
      balance,
      notes: row.notes ?? undefined,
    };
  }
}

export function createPostgresRepository(databaseUrl: string): PostgresRepository {
  return new PostgresRepository(createDrizzle(databaseUrl));
}

function userFromRow(row: UserRow): User {
  return {
    id: row.id,
    telegramId: row.telegramId,
    role: row.role as Role,
    name: row.name,
    phone: row.phone ?? undefined,
  };
}

function productFromRow(row: ProductRow): Product {
  return {
    id: row.id,
    posterId: row.posterId,
    name: row.name,
    category: row.category,
    basePrice: row.basePrice,
    cost: row.cost,
    unit: row.unit,
    isStopped: row.isStopped,
  };
}

function orderToRow(order: Order): typeof schema.orders.$inferInsert {
  return {
    ...order,
    paymentType: order.paymentType,
    deliveryType: order.deliveryType,
    items: order.items,
    location: order.location,
    createdAt: new Date(order.createdAt),
    updatedAt: new Date(order.updatedAt),
  };
}

function orderFromRow(row: OrderRow): Order {
  return {
    id: row.id,
    clientId: row.clientId,
    clientName: row.clientName,
    createdBy: row.createdBy,
    status: row.status as OrderStatus,
    items: row.items as OrderItem[],
    total: row.total,
    paymentType: row.paymentType as PaymentType,
    deliveryType: (row.deliveryType as DeliveryType | null) ?? undefined,
    driverId: row.driverId ?? undefined,
    yandexDeeplink: row.yandexDeeplink ?? undefined,
    location: row.location as ClientLocation,
    contactPhone: row.contactPhone,
    portions: row.portions,
    notes: row.notes ?? undefined,
    posterOrderId: row.posterOrderId ?? undefined,
    cashCollected: row.cashCollected ?? undefined,
    cashCustody: (row.cashCustody as CashCustody | null) ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function ledgerFromRow(row: LedgerRow): LedgerEntry {
  return {
    id: row.id,
    clientId: row.clientId,
    orderId: row.orderId ?? undefined,
    type: row.type as LedgerEntry['type'],
    amount: row.amount,
    method: row.method ?? undefined,
    note: row.note ?? undefined,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  };
}

function moneyAccountFromRow(row: MoneyAccountRow): StoredMoneyAccount {
  return {
    id: row.id,
    type: row.type as MoneyAccountType,
    name: row.name,
    ownerUserId: row.ownerUserId ?? undefined,
    createdAt: row.createdAt.toISOString(),
  };
}

function moneyMovementToRow(movement: StoredMoneyMovement): typeof schema.moneyMovements.$inferInsert {
  return {
    id: movement.id,
    type: movement.type,
    status: movement.status,
    fromAccountId: movement.fromAccountId,
    toAccountId: movement.toAccountId,
    amount: movement.amount,
    category: movement.category,
    note: movement.note,
    counterparty: movement.counterparty,
    orderId: movement.orderId,
    staffId: movement.staffId,
    createdBy: movement.createdBy,
    approvedBy: movement.approvedBy,
    createdAt: new Date(movement.createdAt),
    occurredAt: new Date(movement.occurredAt),
  };
}

function moneyMovementFromRow(row: MoneyMovementRow): StoredMoneyMovement {
  return {
    id: row.id,
    type: row.type as MoneyMovementType,
    status: row.status as MoneyMovementStatus,
    fromAccountId: row.fromAccountId ?? undefined,
    toAccountId: row.toAccountId ?? undefined,
    amount: row.amount,
    category: row.category ?? undefined,
    note: row.note ?? undefined,
    counterparty: row.counterparty ?? undefined,
    orderId: row.orderId ?? undefined,
    staffId: row.staffId ?? undefined,
    createdBy: row.createdBy,
    approvedBy: row.approvedBy ?? undefined,
    createdAt: row.createdAt.toISOString(),
    occurredAt: row.occurredAt.toISOString(),
  };
}

function staffFromRow(row: StaffRow): StoredStaff {
  return {
    id: row.id,
    name: row.name,
    position: row.position,
    salary: row.salary,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
  };
}

function ingredientFromRow(row: IngredientRow): StoredIngredient {
  return {
    id: row.id,
    name: row.name,
    unit: row.unit,
    stock: row.stock,
    minStock: row.minStock,
    supplier: row.supplier,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
  };
}
