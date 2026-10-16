alter table clinic_visit add column if not exists status text not null default 'kept';

create table if not exists clinic_access (
  id text primary key,
  email text not null,
  action text not null,
  subject text not null,
  at timestamptz not null default now()
);
