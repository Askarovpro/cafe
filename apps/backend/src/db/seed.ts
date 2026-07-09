import { Role } from '@b2b/shared';
import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const users = [
  { id: 'u1', telegramId: '1001', role: Role.Manager, name: 'Menejer', phone: '+998900000001' },
  { id: 'u2', telegramId: '1002', role: Role.Kitchen, name: 'Oshxona', phone: '+998900000002' },
  { id: 'd1', telegramId: '2001', role: Role.Driver, name: 'Botir (driver)', phone: '+998900000003' },
  { id: 'f1', telegramId: '3001', role: Role.Finance, name: 'Moliyachi', phone: '+998900000004' },
  { id: 'o1', telegramId: '4001', role: Role.Owner, name: 'Egasi', phone: '+998900000005' },
];

const clients = [
  {
    id: 'c1',
    name: 'Oq Saroy MChJ',
    contactName: 'Aziz aka',
    contactPhone: '+998901112233',
    locations: [{ label: 'Ofis', address: 'Toshkent, Chilonzor 5', lat: 41.29, lng: 69.2 }],
  },
  {
    id: 'c2',
    name: 'Bahor Cafe',
    contactName: 'Dilnoza',
    contactPhone: '+998907778899',
    locations: [{ label: 'Filial 1', address: 'Toshkent, Yunusobod 12', lat: 41.36, lng: 69.28 }],
  },
];

const products = [
  { id: 'p1', posterId: '101', name: 'Osh (porsiya)', category: 'Milliy', basePrice: 35000, cost: 18000, unit: 'porsiya', isStopped: false },
  { id: 'p2', posterId: '102', name: 'Manti (5 dona)', category: 'Milliy', basePrice: 30000, cost: 14000, unit: 'porsiya', isStopped: false },
  { id: 'p3', posterId: '103', name: "Lag'mon", category: 'Milliy', basePrice: 32000, cost: 15000, unit: 'porsiya', isStopped: false },
  { id: 'p4', posterId: '104', name: 'Somsa', category: 'Pech', basePrice: 12000, cost: 5000, unit: 'dona', isStopped: false },
  { id: 'p5', posterId: '105', name: 'Choy (choynak)', category: 'Ichimlik', basePrice: 8000, cost: 2000, unit: 'choynak', isStopped: false },
];

const clientPrices = [
  { clientId: 'c1', productId: 'p1', price: 32000 },
  { clientId: 'c1', productId: 'p2', price: 28000 },
  { clientId: 'c1', productId: 'p4', price: 11000 },
];

const staff = [
  { id: 'staff_aziz', name: 'Aziz', position: 'Oshpaz', salary: 4000000 },
  { id: 'staff_dilnoza', name: 'Dilnoza', position: 'Ofitsiant', salary: 2500000 },
];

const pool = new Pool({ connectionString: databaseUrl });

try {
  await pool.query('begin');

  for (const user of users) {
    await pool.query(
      `
        insert into users (id, telegram_id, role, name, phone)
        values ($1, $2, $3, $4, $5)
        on conflict (id) do update set
          telegram_id = excluded.telegram_id,
          role = excluded.role,
          name = excluded.name,
          phone = excluded.phone
      `,
      [user.id, user.telegramId, user.role, user.name, user.phone],
    );
  }

  for (const client of clients) {
    await pool.query(
      `
        insert into clients (id, name, contact_name, contact_phone, locations)
        values ($1, $2, $3, $4, $5::jsonb)
        on conflict (id) do update set
          name = excluded.name,
          contact_name = excluded.contact_name,
          contact_phone = excluded.contact_phone,
          locations = excluded.locations
      `,
      [client.id, client.name, client.contactName, client.contactPhone, JSON.stringify(client.locations)],
    );
  }

  for (const product of products) {
    await pool.query(
      `
        insert into products (id, poster_id, name, category, base_price, cost, unit, is_stopped, synced_at)
        values ($1, $2, $3, $4, $5, $6, $7, $8, now())
        on conflict (id) do update set
          poster_id = excluded.poster_id,
          name = excluded.name,
          category = excluded.category,
          base_price = excluded.base_price,
          cost = excluded.cost,
          unit = excluded.unit,
          is_stopped = excluded.is_stopped,
          synced_at = now()
      `,
      [product.id, product.posterId, product.name, product.category, product.basePrice, product.cost, product.unit, product.isStopped],
    );
  }

  for (const price of clientPrices) {
    await pool.query(
      `
        insert into client_prices (client_id, product_id, price)
        values ($1, $2, $3)
        on conflict (client_id, product_id) do update set price = excluded.price
      `,
      [price.clientId, price.productId, price.price],
    );
  }

  for (const person of staff) {
    await pool.query(
      `
        insert into staff (id, name, position, salary, active, created_at)
        values ($1, $2, $3, $4, true, now())
        on conflict (id) do update set
          name = excluded.name,
          position = excluded.position,
          salary = excluded.salary,
          active = true
      `,
      [person.id, person.name, person.position, person.salary],
    );
  }

  await pool.query(`
    insert into money_accounts (id, type, name, created_at)
    select 'money_account_cashbox', 'cashbox', 'Kassa', now()
    where not exists (select 1 from money_accounts where type = 'cashbox')
  `);

  await pool.query('commit');
  console.log('seeded dev fixtures');
} catch (error) {
  await pool.query('rollback');
  throw error;
} finally {
  await pool.end();
}
