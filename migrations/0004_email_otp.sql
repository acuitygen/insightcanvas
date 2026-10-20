-- Emailed one-time codes and server sessions for the email allow-list.
alter table allowed_email add column if not exists is_admin boolean not null default false;

-- Whoever was first on the list becomes the first admin.
update allowed_email set is_admin = true
where email = (select email from allowed_email order by created_at, email limit 1)
  and not exists (select 1 from allowed_email where is_admin);

create table if not exists login_code (
  email text primary key,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  created_at timestamptz not null default now()
);

-- One row per code request or verify attempt, for rate limiting by email and by IP.
create table if not exists login_event (
  id bigserial primary key,
  kind text not null,
  email text not null,
  ip text not null,
  created_at timestamptz not null default now()
);
create index if not exists login_event_email_idx on login_event (kind, email, created_at);
create index if not exists login_event_ip_idx on login_event (kind, ip, created_at);

create table if not exists app_session (
  token_hash text primary key,
  email text not null references allowed_email (email) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists app_session_email_idx on app_session (email);
