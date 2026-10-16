create table if not exists allowed_email (
  email text primary key,
  created_at timestamptz not null default now()
);

create table if not exists visitor_name (
  email text primary key,
  first_name text not null,
  last_name text not null,
  updated_at timestamptz not null default now()
);
