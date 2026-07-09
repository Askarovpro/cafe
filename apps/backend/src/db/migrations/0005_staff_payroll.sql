create table if not exists staff (
  id text primary key,
  name text not null,
  position text not null,
  salary integer not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table money_movements
  add column if not exists staff_id text references staff(id);

create index if not exists money_movements_staff_id_idx on money_movements(staff_id);
