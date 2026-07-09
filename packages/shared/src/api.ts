// Frozen B2B contract — REST endpoint paths + response types.
// Request body types live in schemas.ts. Both backend and frontend import from here.

import type { Client, ClientPrice, LedgerEntry, OfferedProduct, Order, User } from './types.js';

export const API = {
  authTelegram: 'POST /auth/telegram',

  products: 'GET /products', // ?clientId= -> merges clientPrice
  posterWebhook: 'POST /poster/webhook',
  syncProducts: 'POST /admin/sync/products',

  clients: 'GET /clients',
  createClient: 'POST /clients',
  client: 'GET /clients/:id',
  updateClient: 'PATCH /clients/:id',
  clientPrices: 'GET /clients/:id/prices',
  setClientPrice: 'PUT /clients/:id/prices/:productId',
  copyClientPrices: 'POST /clients/:id/prices/copy',
  seedClientPricesFromBase: 'POST /clients/:id/prices/base',
  clientLedger: 'GET /clients/:id/ledger',
  recordPayment: 'POST /clients/:id/payments',

  orders: 'GET /orders', // ?status=&mine= (role-scoped)
  createOrder: 'POST /orders',
  order: 'GET /orders/:id',
  transitionOrder: 'POST /orders/:id/transition',

  // Money ledger (kassa)
  moneyAccounts: 'GET /money/accounts',
  moneyMovements: 'GET /money/movements', // ?limit=
  moneySummary: 'GET /money/summary',
  recordIncome: 'POST /money/income', // finance: cash intake (e.g. from cashier) -> CASHBOX
  recordExpense: 'POST /money/expense', // finance: payout/expense from CASHBOX
} as const;

// Response shapes
export interface AuthResponse {
  token: string;
  user: User;
}
export interface LedgerResponse {
  balance: number;
  entries: LedgerEntry[];
}
export interface SyncResponse {
  synced: number;
}

export type ProductsResponse = OfferedProduct[];
export type ClientsResponse = Client[];
export type ClientResponse = Client;
export type ClientPricesResponse = ClientPrice[];
export type OrdersResponse = Order[];
export type OrderResponse = Order;
export type LedgerEntryResponse = LedgerEntry;
