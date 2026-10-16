create table if not exists report_page (
  id text primary key,
  title text not null,
  audience text not null,
  updated_at timestamptz not null default now()
);

create table if not exists report_tile (
  id text primary key,
  report_id text not null,
  title text not null,
  summary text not null,
  source text not null,
  visual text not null,
  chart text not null,
  columns text not null,
  position integer not null
);
