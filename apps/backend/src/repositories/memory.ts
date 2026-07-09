import {
  OrderStatus,
  type Client,
  type ClientPrice,
  type Ingredient,
  type LedgerEntry,
  type MenuSet,
  type Order,
  type Product,
  type Staff,
  type User,
} from '@b2b/shared';
import { id } from '../ids.js';
import type {
  AppRepository,
  ClientSetPrice,
  MenuSetInput,
  MenuSetPatch,
  ProductUpsert,
  StoredClientPrice,
  StoredClientSetPrice,
  StoredIngredient,
  StoredMoneyAccount,
  StoredMoneyMovement,
  StoredStaff,
} from './types.js';

type StoredMenuSet = Omit<MenuSetInput, 'components'> & {
  components: Array<{ productId: string; qty: number }>;
};

type Seed = {
  users?: User[];
  products?: Product[];
  clients?: Client[];
  clientPrices?: StoredClientPrice[];
  menuSets?: MenuSetInput[];
  clientSetPrices?: StoredClientSetPrice[];
  orders?: Order[];
  ledgerEntries?: LedgerEntry[];
  moneyAccounts?: StoredMoneyAccount[];
  moneyMovements?: StoredMoneyMovement[];
  staff?: Staff[];
  ingredients?: Ingredient[];
};

const clone = <T>(value: T): T => structuredClone(value);

export class MemoryRepository implements AppRepository {
  private users = new Map<string, User>();
  private products = new Map<string, Product>();
  private clients = new Map<string, Omit<Client, 'balance'>>();
  private clientPrices = new Map<string, StoredClientPrice>();
  private menuSets = new Map<string, StoredMenuSet>();
  private clientSetPrices = new Map<string, StoredClientSetPrice>();
  private orders = new Map<string, Order>();
  private ledger = new Map<string, LedgerEntry>();
  private moneyAccounts = new Map<string, StoredMoneyAccount>();
  private moneyMovements = new Map<string, StoredMoneyMovement>();
  private staff = new Map<string, StoredStaff>();
  private ingredients = new Map<string, StoredIngredient>();

  seed(seed: Seed): void {
    for (const user of seed.users ?? []) this.users.set(user.id, clone(user));
    for (const product of seed.products ?? []) this.products.set(product.id, clone(product));
    for (const client of seed.clients ?? []) {
      const { balance: _balance, ...stored } = client;
      this.clients.set(client.id, clone(stored));
    }
    for (const price of seed.clientPrices ?? []) this.clientPrices.set(this.priceKey(price.clientId, price.productId), clone(price));
    for (const set of seed.menuSets ?? []) this.menuSets.set(set.id, clone(set));
    for (const price of seed.clientSetPrices ?? []) this.clientSetPrices.set(this.priceKey(price.clientId, price.setId), clone(price));
    for (const order of seed.orders ?? []) this.orders.set(order.id, clone(order));
    for (const entry of seed.ledgerEntries ?? []) this.ledger.set(entry.id, clone(entry));
    for (const account of seed.moneyAccounts ?? []) this.moneyAccounts.set(account.id, clone(account));
    for (const movement of seed.moneyMovements ?? []) this.moneyMovements.set(movement.id, clone(movement));
    for (const staff of seed.staff ?? []) {
      const { advancesThisMonth: _advancesThisMonth, paidThisMonth: _paidThisMonth, balance: _balance, ...stored } = staff;
      this.staff.set(staff.id, clone({ ...stored, createdAt: new Date(0).toISOString() }));
    }
    for (const ingredient of seed.ingredients ?? []) {
      const { isLow: _isLow, ...stored } = ingredient;
      this.ingredients.set(ingredient.id, clone({ ...stored, createdAt: new Date(0).toISOString() }));
    }
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

  async listMenuSets(query: { activeOnly?: boolean } = {}): Promise<MenuSet[]> {
    return [...this.menuSets.values()].filter((set) => !query.activeOnly || set.active).map((set) => this.menuSetWithComponentNames(set));
  }

  async findMenuSetById(setId: string): Promise<MenuSet | undefined> {
    const set = this.menuSets.get(setId);
    return set ? this.menuSetWithComponentNames(set) : undefined;
  }

  async createMenuSet(set: MenuSetInput): Promise<MenuSet> {
    this.menuSets.set(set.id, clone(set));
    return this.menuSetWithComponentNames(set);
  }

  async updateMenuSet(setId: string, patch: MenuSetPatch): Promise<MenuSet> {
    const set = this.menuSets.get(setId);
    if (!set) throw new Error(`menu set ${setId} not found`);
    const updated: StoredMenuSet = { ...set, ...clone(patch), id: setId };
    this.menuSets.set(setId, updated);
    return this.menuSetWithComponentNames(updated);
  }

  async listClientSetPrices(clientId: string): Promise<ClientSetPrice[]> {
    return [...this.clientSetPrices.values()].filter((price) => price.clientId === clientId).map(({ setId, price }) => ({ setId, price }));
  }

  async findClientSetPrice(clientId: string, setId: string): Promise<ClientSetPrice | undefined> {
    const price = this.clientSetPrices.get(this.priceKey(clientId, setId));
    return price ? { setId: price.setId, price: price.price } : undefined;
  }

  async setClientSetPrice(clientId: string, price: ClientSetPrice): Promise<ClientSetPrice> {
    this.clientSetPrices.set(this.priceKey(clientId, price.setId), { clientId, ...clone(price) });
    return clone(price);
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

  async listStaff(): Promise<StoredStaff[]> {
    return [...this.staff.values()].map(clone);
  }

  async findStaffById(staffId: string): Promise<StoredStaff | undefined> {
    return clone(this.staff.get(staffId));
  }

  async createStaff(staff: StoredStaff): Promise<StoredStaff> {
    this.staff.set(staff.id, clone(staff));
    return clone(staff);
  }

  async updateStaff(staffId: string, patch: Partial<Omit<StoredStaff, 'id' | 'createdAt'>>): Promise<StoredStaff> {
    const staff = this.staff.get(staffId);
    if (!staff) throw new Error(`staff ${staffId} not found`);
    const updated = { ...staff, ...clone(patch), id: staffId };
    this.staff.set(staffId, updated);
    return clone(updated);
  }

  async listIngredients(query: { activeOnly?: boolean } = {}): Promise<StoredIngredient[]> {
    return [...this.ingredients.values()].filter((ingredient) => !query.activeOnly || ingredient.active).map(clone);
  }

  async findIngredientById(ingredientId: string): Promise<StoredIngredient | undefined> {
    return clone(this.ingredients.get(ingredientId));
  }

  async createIngredient(ingredient: StoredIngredient): Promise<StoredIngredient> {
    this.ingredients.set(ingredient.id, clone(ingredient));
    return clone(ingredient);
  }

  async updateIngredient(ingredientId: string, patch: Partial<Omit<StoredIngredient, 'id' | 'createdAt'>>): Promise<StoredIngredient> {
    const ingredient = this.ingredients.get(ingredientId);
    if (!ingredient) throw new Error(`ingredient ${ingredientId} not found`);
    const updated = { ...ingredient, ...clone(patch), id: ingredientId };
    this.ingredients.set(ingredientId, updated);
    return clone(updated);
  }

  private withBalance(client: Omit<Client, 'balance'>): Client {
    const balance = [...this.ledger.values()]
      .filter((entry) => entry.clientId === client.id)
      .reduce((sum, entry) => sum + (entry.type === 'charge' ? entry.amount : -entry.amount), 0);
    return { ...clone(client), balance };
  }

  private menuSetWithComponentNames(set: StoredMenuSet): MenuSet {
    return {
      id: set.id,
      name: set.name,
      description: set.description,
      image: set.image,
      basePrice: set.basePrice,
      active: set.active,
      components: set.components.map((component) => ({
        productId: component.productId,
        name: this.products.get(component.productId)?.name ?? '',
        qty: component.qty,
      })),
    };
  }

  private priceKey(clientId: string, productId: string): string {
    return `${clientId}:${productId}`;
  }
}
