CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  telegram_id text NOT NULL UNIQUE,
  role text NOT NULL,
  name text NOT NULL,
  phone text,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS clients (
  id text PRIMARY KEY,
  name text NOT NULL,
  contact_name text NOT NULL,
  contact_phone text NOT NULL,
  locations jsonb NOT NULL,
  notes text
);

CREATE TABLE IF NOT EXISTS products (
  id text PRIMARY KEY,
  poster_id text NOT NULL UNIQUE,
  name text NOT NULL,
  category text NOT NULL,
  base_price numeric NOT NULL,
  cost numeric NOT NULL,
  unit text NOT NULL,
  is_stopped boolean NOT NULL DEFAULT false,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS client_prices (
  client_id text NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  product_id text NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  price numeric NOT NULL,
  PRIMARY KEY (client_id, product_id)
);

CREATE TABLE IF NOT EXISTS orders (
  id text PRIMARY KEY,
  client_id text NOT NULL REFERENCES clients(id),
  client_name text NOT NULL,
  created_by text NOT NULL REFERENCES users(id),
  status text NOT NULL,
  items jsonb NOT NULL,
  total numeric NOT NULL,
  payment_type text NOT NULL,
  delivery_type text,
  driver_id text REFERENCES users(id),
  yandex_deeplink text,
  location jsonb NOT NULL,
  contact_phone text NOT NULL,
  portions numeric NOT NULL,
  notes text,
  poster_order_id text,
  cash_collected boolean,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id text PRIMARY KEY,
  client_id text NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  order_id text REFERENCES orders(id),
  type text NOT NULL,
  amount numeric NOT NULL,
  method text,
  note text,
  created_by text NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL
);
