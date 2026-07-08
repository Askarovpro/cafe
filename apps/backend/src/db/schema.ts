import { boolean, jsonb, numeric, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

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
