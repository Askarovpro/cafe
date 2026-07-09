import { sql } from 'drizzle-orm';
import { boolean, index, integer, jsonb, numeric, pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  telegramId: text('telegram_id').notNull().unique(),
  role: text('role').notNull(),
  name: text('name').notNull(),
  phone: text('phone'),
  active: boolean('active').notNull().default(true),
});

export const clients = pgTable('clients', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  contactName: text('contact_name').notNull(),
  contactPhone: text('contact_phone').notNull(),
  locations: jsonb('locations').notNull(),
  notes: text('notes'),
});

export const products = pgTable('products', {
  id: text('id').primaryKey(),
  posterId: text('poster_id').notNull().unique(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  basePrice: numeric('base_price', { mode: 'number' }).notNull(),
  cost: numeric('cost', { mode: 'number' }).notNull(),
  unit: text('unit').notNull(),
  isStopped: boolean('is_stopped').notNull().default(false),
  syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
});

export const clientPrices = pgTable(
  'client_prices',
  {
    clientId: text('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
    productId: text('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
    price: numeric('price', { mode: 'number' }).notNull(),
  },
  (table) => ({ pk: primaryKey({ columns: [table.clientId, table.productId] }) }),
);

export const orders = pgTable('orders', {
  id: text('id').primaryKey(),
  clientId: text('client_id').notNull().references(() => clients.id),
  clientName: text('client_name').notNull(),
  createdBy: text('created_by').notNull().references(() => users.id),
  status: text('status').notNull(),
  items: jsonb('items').notNull(),
  total: numeric('total', { mode: 'number' }).notNull(),
  paymentType: text('payment_type').notNull(),
  deliveryType: text('delivery_type'),
  driverId: text('driver_id').references(() => users.id),
  yandexDeeplink: text('yandex_deeplink'),
  location: jsonb('location').notNull(),
  contactPhone: text('contact_phone').notNull(),
  portions: numeric('portions', { mode: 'number' }).notNull(),
  notes: text('notes'),
  posterOrderId: text('poster_order_id'),
  cashCollected: boolean('cash_collected'),
  cashCustody: text('cash_custody'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
});

export const ledgerEntries = pgTable('ledger_entries', {
  id: text('id').primaryKey(),
  clientId: text('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  orderId: text('order_id').references(() => orders.id),
  type: text('type').notNull(),
  amount: numeric('amount', { mode: 'number' }).notNull(),
  method: text('method'),
  note: text('note'),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});

export const moneyAccounts = pgTable(
  'money_accounts',
  {
    id: text('id').primaryKey(),
    type: text('type').notNull(),
    name: text('name').notNull(),
    ownerUserId: text('owner_user_id').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    cashboxSingleton: uniqueIndex('money_accounts_cashbox_singleton').on(table.type).where(sql`type = 'cashbox'`),
    typeOwner: uniqueIndex('money_accounts_type_owner_unique').on(table.type, table.ownerUserId).where(sql`owner_user_id IS NOT NULL`),
  }),
);

export const staff = pgTable('staff', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  position: text('position').notNull(),
  salary: integer('salary').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const ingredients = pgTable('ingredients', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  unit: text('unit').notNull(),
  stock: numeric('stock', { mode: 'number' }).notNull(),
  minStock: numeric('min_stock', { mode: 'number' }).notNull(),
  supplier: text('supplier').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const moneyMovements = pgTable(
  'money_movements',
  {
    id: text('id').primaryKey(),
    type: text('type').notNull(),
    status: text('status').notNull(),
    fromAccountId: text('from_account_id').references(() => moneyAccounts.id),
    toAccountId: text('to_account_id').references(() => moneyAccounts.id),
    amount: integer('amount').notNull(),
    category: text('category'),
    note: text('note'),
    counterparty: text('counterparty'),
    orderId: text('order_id').references(() => orders.id),
    staffId: text('staff_id').references(() => staff.id),
    createdBy: text('created_by').notNull().references(() => users.id),
    approvedBy: text('approved_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  },
  (table) => ({
    createdAt: index('money_movements_created_at_idx').on(table.createdAt),
    orderId: index('money_movements_order_id_idx').on(table.orderId),
    staffId: index('money_movements_staff_id_idx').on(table.staffId),
  }),
);
