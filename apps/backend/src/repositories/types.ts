import type { Client, ClientLocation, ClientPrice, LedgerEntry, MoneyAccount, MoneyMovement, Order, Product, Staff, User } from '@b2b/shared';

export interface StoredClientPrice extends ClientPrice {
  clientId: string;
}

export interface StoredMoneyAccount extends Omit<MoneyAccount, 'balance' | 'pendingIn' | 'pendingOut'> {
  createdAt: string;
}

export interface StoredMoneyMovement extends MoneyMovement {}

export interface StoredStaff extends Omit<Staff, 'advancesThisMonth' | 'paidThisMonth' | 'balance'> {
  createdAt: string;
}

export interface ProductUpsert {
  posterId: string;
  name: string;
  category: string;
  basePrice: number;
  cost: number;
  unit: string;
  isStopped: boolean;
}

export interface AppRepository {
  findUserByTelegramId(telegramId: string): Promise<User | undefined>;
  findUserById(id: string): Promise<User | undefined>;
  createUser(user: User): Promise<User>;

  listProducts(): Promise<Product[]>;
  findProductById(id: string): Promise<Product | undefined>;
  upsertProduct(product: ProductUpsert): Promise<Product>;

  listClients(): Promise<Client[]>;
  findClientById(id: string): Promise<Client | undefined>;
  createClient(client: Omit<Client, 'balance'>): Promise<Client>;
  updateClient(id: string, patch: Partial<Omit<Client, 'id' | 'balance'>>): Promise<Client>;

  listClientPrices(clientId: string): Promise<ClientPrice[]>;
  findClientPrice(clientId: string, productId: string): Promise<ClientPrice | undefined>;
  setClientPrice(clientId: string, price: ClientPrice): Promise<ClientPrice>;
  replaceClientPrices(clientId: string, prices: ClientPrice[]): Promise<ClientPrice[]>;

  listLedgerEntries(clientId: string): Promise<LedgerEntry[]>;
  appendLedgerEntry(entry: LedgerEntry): Promise<LedgerEntry>;
  findLedgerEntry(query: { orderId: string; type: LedgerEntry['type']; method?: string }): Promise<LedgerEntry | undefined>;

  createOrder(order: Order): Promise<Order>;
  findOrderById(id: string): Promise<Order | undefined>;
  updateOrder(order: Order): Promise<Order>;
  listOrders(query?: { status?: string; createdBy?: string; driverId?: string; activeOnly?: boolean }): Promise<Order[]>;

  listMoneyAccounts(): Promise<StoredMoneyAccount[]>;
  findMoneyAccount(query: { type: StoredMoneyAccount['type']; ownerUserId?: string }): Promise<StoredMoneyAccount | undefined>;
  createMoneyAccount(account: StoredMoneyAccount): Promise<StoredMoneyAccount>;

  listMoneyMovements(query?: { orderId?: string; limit?: number }): Promise<StoredMoneyMovement[]>;
  findMoneyMovementById(id: string): Promise<StoredMoneyMovement | undefined>;
  createMoneyMovement(movement: StoredMoneyMovement): Promise<StoredMoneyMovement>;
  updateMoneyMovement(movement: StoredMoneyMovement): Promise<StoredMoneyMovement>;

  listStaff(): Promise<StoredStaff[]>;
  findStaffById(id: string): Promise<StoredStaff | undefined>;
  createStaff(staff: StoredStaff): Promise<StoredStaff>;
  updateStaff(id: string, patch: Partial<Omit<StoredStaff, 'id' | 'createdAt'>>): Promise<StoredStaff>;
}

export type NewClientInput = {
  name: string;
  contactName: string;
  contactPhone: string;
  locations: ClientLocation[];
  notes?: string;
};
