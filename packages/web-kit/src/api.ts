// Typed API client against the frozen @b2b/shared contract.
import type {
  AuthResponse, Client, ClientPrice, CreateOrder, LedgerEntry, LedgerResponse,
  CreateStaff, MoneyAccount, MoneyMovement, MoneySummary, OfferedProduct, Order,
  PayStaff, RecordExpense, RecordIncome, RecordPayment, Staff, UpdateStaff, Transition,
} from '@b2b/shared';

export class ApiClient {
  constructor(private base: string, private token?: string) {}
  setToken(t: string) { this.token = t; }

  private async req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(this.base + path, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new ApiError(res.status, await res.text().catch(() => res.statusText));
    return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
  }

  authTelegram(initData: string) { return this.req<AuthResponse>('POST', '/auth/telegram', { initData }); }

  products(clientId?: string) {
    return this.req<OfferedProduct[]>('GET', `/products${clientId ? `?clientId=${clientId}` : ''}`);
  }

  clients() { return this.req<Client[]>('GET', '/clients'); }
  createClient(body: Partial<Client>) { return this.req<Client>('POST', '/clients', body); }
  client(id: string) { return this.req<Client>('GET', `/clients/${id}`); }
  updateClient(id: string, body: Partial<Client>) { return this.req<Client>('PATCH', `/clients/${id}`, body); }

  prices(id: string) { return this.req<ClientPrice[]>('GET', `/clients/${id}/prices`); }
  setPrice(id: string, productId: string, price: number) {
    return this.req<ClientPrice>('PUT', `/clients/${id}/prices/${productId}`, { price });
  }
  copyPrices(id: string, fromClientId: string) {
    return this.req<ClientPrice[]>('POST', `/clients/${id}/prices/copy`, { fromClientId });
  }
  seedPricesFromBase(id: string) { return this.req<ClientPrice[]>('POST', `/clients/${id}/prices/base`); }

  ledger(id: string) { return this.req<LedgerResponse>('GET', `/clients/${id}/ledger`); }
  recordPayment(id: string, body: RecordPayment) {
    return this.req<LedgerEntry>('POST', `/clients/${id}/payments`, body);
  }

  orders(query?: { status?: string; mine?: boolean }) {
    const q = new URLSearchParams();
    if (query?.status) q.set('status', query.status);
    if (query?.mine) q.set('mine', 'true');
    const s = q.toString();
    return this.req<Order[]>('GET', `/orders${s ? `?${s}` : ''}`);
  }
  createOrder(body: CreateOrder) { return this.req<Order>('POST', '/orders', body); }
  order(id: string) { return this.req<Order>('GET', `/orders/${id}`); }
  transition(id: string, body: Transition) { return this.req<Order>('POST', `/orders/${id}/transition`, body); }

  // Money ledger (kassa)
  moneyAccounts() { return this.req<MoneyAccount[]>('GET', '/money/accounts'); }
  moneyMovements(limit = 50) { return this.req<MoneyMovement[]>('GET', `/money/movements?limit=${limit}`); }
  moneySummary() { return this.req<MoneySummary>('GET', '/money/summary'); }
  recordIncome(body: RecordIncome) { return this.req<MoneyMovement>('POST', '/money/income', body); }
  recordExpense(body: RecordExpense) { return this.req<MoneyMovement>('POST', '/money/expense', body); }

  // Payroll
  staff() { return this.req<Staff[]>('GET', '/staff'); }
  createStaff(body: CreateStaff) { return this.req<Staff>('POST', '/staff', body); }
  updateStaff(id: string, body: UpdateStaff) { return this.req<Staff>('PATCH', `/staff/${id}`, body); }
  payStaff(id: string, body: PayStaff) { return this.req<MoneyMovement>('POST', `/staff/${id}/pay`, body); }
}

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
