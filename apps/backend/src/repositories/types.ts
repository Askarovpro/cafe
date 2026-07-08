import type { Client, ClientLocation, ClientPrice, LedgerEntry, Order, Product, User } from '@b2b/shared';

export interface StoredClientPrice extends ClientPrice {
  clientId: string;
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
}

export type NewClientInput = {
  name: string;
  contactName: string;
  contactPhone: string;
  locations: ClientLocation[];
  notes?: string;
};
