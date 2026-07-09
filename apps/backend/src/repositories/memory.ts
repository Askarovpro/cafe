import {
  OrderStatus,
  type Client,
  type ClientPrice,
  type LedgerEntry,
  type Order,
  type Product,
  type User,
} from '@b2b/shared';
import { id } from '../ids.js';
import type { AppRepository, ProductUpsert, StoredClientPrice, StoredMoneyAccount, StoredMoneyMovement } from './types.js';

type Seed = {
  users?: User[];
  products?: Product[];
  clients?: Client[];
  clientPrices?: StoredClientPrice[];
  orders?: Order[];
  ledgerEntries?: LedgerEntry[];
  moneyAccounts?: StoredMoneyAccount[];
  moneyMovements?: StoredMoneyMovement[];
};

const clone = <T>(value: T): T => structuredClone(value);

export class MemoryRepository implements AppRepository {
  private users = new Map<string, User>();
  private products = new Map<string, Product>();
  private clients = new Map<string, Omit<Client, 'balance'>>();
  private clientPrices = new Map<string, StoredClientPrice>();
  private orders = new Map<string, Order>();
  private ledger = new Map<string, LedgerEntry>();
  private moneyAccounts = new Map<string, StoredMoneyAccount>();
  private moneyMovements = new Map<string, StoredMoneyMovement>();

  seed(seed: Seed): void {
    for (const user of seed.users ?? []) this.users.set(user.id, clone(user));
    for (const product of seed.products ?? []) this.products.set(product.id, clone(product));
    for (const client of seed.clients ?? []) {
      const { balance: _balance, ...stored } = client;
      this.clients.set(client.id, clone(stored));
    }
    for (const price of seed.clientPrices ?? []) this.clientPrices.set(this.priceKey(price.clientId, price.productId), clone(price));
    for (const order of seed.orders ?? []) this.orders.set(order.id, clone(order));
    for (const entry of seed.ledgerEntries ?? []) this.ledger.set(entry.id, clone(entry));
    for (const account of seed.moneyAccounts ?? []) this.moneyAccounts.set(account.id, clone(account));
    for (const movement of seed.moneyMovements ?? []) this.moneyMovements.set(movement.id, clone(movement));
  }

  async findUserByTelegramId(telegramId: string): Promise<User | undefined> {
    return clone([...this.users.values()].find((user) => user.telegramId === telegramId));
  }

  async findUserById(userId: string): Promise<User | undefined> {
    return clone(this.users.get(userId));
  }

  async createUser(user: User): Promise<User> {
    this.users.set(user.id, clone(user));
    return clone(user);
  }

  async listProducts(): Promise<Product[]> {
    return [...this.products.values()].map(clone);
  }

  async findProductById(productId: string): Promise<Product | undefined> {
    return clone(this.products.get(productId));
  }

  async upsertProduct(input: ProductUpsert): Promise<Product> {
    const existing = [...this.products.values()].find((product) => product.posterId === input.posterId);
    const product: Product = { id: existing?.id ?? id('product'), ...input };
    this.products.set(product.id, clone(product));
    return clone(product);
  }

  async listClients(): Promise<Client[]> {
    return [...this.clients.values()].map((client) => this.withBalance(client));
  }

  async findClientById(clientId: string): Promise<Client | undefined> {
    const client = this.clients.get(clientId);
    return client ? this.withBalance(client) : undefined;
  }

  async createClient(client: Omit<Client, 'balance'>): Promise<Client> {
    this.clients.set(client.id, clone(client));
    return this.withBalance(client);
  }

  async updateClient(clientId: string, patch: Partial<Omit<Client, 'id' | 'balance'>>): Promise<Client> {
    const client = this.clients.get(clientId);
    if (!client) throw new Error(`client ${clientId} not found`);
    const updated = { ...client, ...clone(patch), id: clientId };
    this.clients.set(clientId, updated);
    return this.withBalance(updated);
  }

  async listClientPrices(clientId: string): Promise<ClientPrice[]> {
    return [...this.clientPrices.values()].filter((price) => price.clientId === clientId).map(({ productId, price }) => ({ productId, price }));
  }

  async findClientPrice(clientId: string, productId: string): Promise<ClientPrice | undefined> {
    const price = this.clientPrices.get(this.priceKey(clientId, productId));
    return price ? { productId: price.productId, price: price.price } : undefined;
  }

  async setClientPrice(clientId: string, price: ClientPrice): Promise<ClientPrice> {
    this.clientPrices.set(this.priceKey(clientId, price.productId), { clientId, ...clone(price) });
    return clone(price);
  }

  async replaceClientPrices(clientId: string, prices: ClientPrice[]): Promise<ClientPrice[]> {
    for (const key of [...this.clientPrices.keys()]) {
      if (key.startsWith(`${clientId}:`)) this.clientPrices.delete(key);
    }
    for (const price of prices) this.clientPrices.set(this.priceKey(clientId, price.productId), { clientId, ...clone(price) });
    return prices.map(clone);
  }

  async listLedgerEntries(clientId: string): Promise<LedgerEntry[]> {
    return [...this.ledger.values()].filter((entry) => entry.clientId === clientId).map(clone);
  }

  async appendLedgerEntry(entry: LedgerEntry): Promise<LedgerEntry> {
    this.ledger.set(entry.id, clone(entry));
    return clone(entry);
  }

  async findLedgerEntry(query: { orderId: string; type: LedgerEntry['type']; method?: string }): Promise<LedgerEntry | undefined> {
    return clone(
      [...this.ledger.values()].find(
        (entry) => entry.orderId === query.orderId && entry.type === query.type && (query.method == null || entry.method === query.method),
      ),
    );
  }

  async createOrder(order: Order): Promise<Order> {
    this.orders.set(order.id, clone(order));
    return clone(order);
  }

  async findOrderById(orderId: string): Promise<Order | undefined> {
    return clone(this.orders.get(orderId));
  }

  async updateOrder(order: Order): Promise<Order> {
    this.orders.set(order.id, clone(order));
    return clone(order);
  }

  async listOrders(query: { status?: string; createdBy?: string; driverId?: string; activeOnly?: boolean } = {}): Promise<Order[]> {
    return [...this.orders.values()]
      .filter((order) => !query.status || order.status === query.status)
      .filter((order) => !query.createdBy || order.createdBy === query.createdBy)
      .filter((order) => !query.driverId || order.driverId === query.driverId)
      .filter((order) => !query.activeOnly || ![OrderStatus.Closed, OrderStatus.Cancelled].includes(order.status))
      .map(clone);
  }

  async listMoneyAccounts(): Promise<StoredMoneyAccount[]> {
    return [...this.moneyAccounts.values()].map(clone);
  }

  async findMoneyAccount(query: { type: StoredMoneyAccount['type']; ownerUserId?: string }): Promise<StoredMoneyAccount | undefined> {
    return clone(
      [...this.moneyAccounts.values()].find(
        (account) => account.type === query.type && (query.ownerUserId == null || account.ownerUserId === query.ownerUserId),
      ),
    );
  }

  async createMoneyAccount(account: StoredMoneyAccount): Promise<StoredMoneyAccount> {
    this.moneyAccounts.set(account.id, clone(account));
    return clone(account);
  }

  async listMoneyMovements(query: { orderId?: string; limit?: number } = {}): Promise<StoredMoneyMovement[]> {
    return [...this.moneyMovements.values()]
      .filter((movement) => !query.orderId || movement.orderId === query.orderId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, query.limit)
      .map(clone);
  }

  async findMoneyMovementById(movementId: string): Promise<StoredMoneyMovement | undefined> {
    return clone(this.moneyMovements.get(movementId));
  }

  async createMoneyMovement(movement: StoredMoneyMovement): Promise<StoredMoneyMovement> {
    this.moneyMovements.set(movement.id, clone(movement));
    return clone(movement);
  }

  async updateMoneyMovement(movement: StoredMoneyMovement): Promise<StoredMoneyMovement> {
    this.moneyMovements.set(movement.id, clone(movement));
    return clone(movement);
  }

  private withBalance(client: Omit<Client, 'balance'>): Client {
    const balance = [...this.ledger.values()]
      .filter((entry) => entry.clientId === client.id)
      .reduce((sum, entry) => sum + (entry.type === 'charge' ? entry.amount : -entry.amount), 0);
    return { ...clone(client), balance };
  }

  private priceKey(clientId: string, productId: string): string {
    return `${clientId}:${productId}`;
  }
}
