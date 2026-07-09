CREATE TABLE IF NOT EXISTS menu_sets (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text,
  base_price numeric NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS menu_set_components (
  id text PRIMARY KEY,
  menu_set_id text NOT NULL REFERENCES menu_sets(id) ON DELETE CASCADE,
  product_id text NOT NULL REFERENCES products(id),
  qty numeric NOT NULL,
  sort_order integer NOT NULL
);

CREATE INDEX IF NOT EXISTS menu_set_components_menu_set_id_idx ON menu_set_components(menu_set_id);

CREATE TABLE IF NOT EXISTS client_set_prices (
  client_id text NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  set_id text NOT NULL REFERENCES menu_sets(id) ON DELETE CASCADE,
  price numeric NOT NULL,
  PRIMARY KEY (client_id, set_id)
);
