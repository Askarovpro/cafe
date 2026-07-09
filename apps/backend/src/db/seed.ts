import { Role } from '@b2b/shared';
import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

// Bootstrap only: role users (for auth) + the singleton cashbox.
// Real clients, menu (Poster sync), staff and inventory are entered/synced in-app.
const users = [
  { id: 'u1', telegramId: '1001', role: Role.Manager, name: 'Menejer', phone: '+998900000001' },
  { id: 'u2', telegramId: '1002', role: Role.Kitchen, name: 'Oshxona', phone: '+998900000002' },
  { id: 'd1', telegramId: '2001', role: Role.Driver, name: 'Botir (driver)', phone: '+998900000003' },
  { id: 'f1', telegramId: '3001', role: Role.Finance, name: 'Moliyachi', phone: '+998900000004' },
  { id: 'o1', telegramId: '4001', role: Role.Owner, name: 'Egasi', phone: '+998900000005' },
  { id: 'w1', telegramId: '5001', role: Role.Warehouse, name: 'Skladchi', phone: '+998900000006' },
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

  await pool.query(`
    insert into money_accounts (id, type, name, created_at)
    select 'money_account_cashbox', 'cashbox', 'Kassa', now()
    where not exists (select 1 from money_accounts where type = 'cashbox')
  `);

  await pool.query('commit');
  console.log('seeded users + cashbox');
} catch (error) {
  await pool.query('rollback');
  throw error;
} finally {
  await pool.end();
}
