create table if not exists ingredients (
  id text primary key,
  name text not null,
  unit text not null,
  stock numeric not null,
  min_stock numeric not null,
  supplier text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
