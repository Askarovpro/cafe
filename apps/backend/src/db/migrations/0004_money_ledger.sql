CREATE TABLE IF NOT EXISTS money_accounts (
  id text PRIMARY KEY,
  type text NOT NULL,
  name text NOT NULL,
  owner_user_id text REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS money_accounts_cashbox_singleton
  ON money_accounts (type)
  WHERE type = 'cashbox';

CREATE UNIQUE INDEX IF NOT EXISTS money_accounts_type_owner_unique
  ON money_accounts (type, owner_user_id)
  WHERE owner_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS money_movements (
  id text PRIMARY KEY,
  type text NOT NULL,
  status text NOT NULL,
  from_account_id text REFERENCES money_accounts(id),
  to_account_id text REFERENCES money_accounts(id),
  amount integer NOT NULL,
  category text,
  note text,
  counterparty text,
  order_id text REFERENCES orders(id),
  created_by text NOT NULL REFERENCES users(id),
  approved_by text REFERENCES users(id),
  created_at timestamptz NOT NULL,
  occurred_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS money_movements_created_at_idx ON money_movements (created_at);
CREATE INDEX IF NOT EXISTS money_movements_order_id_idx ON money_movements (order_id);
