-- LOCAL DEVELOPMENT ONLY. Supabase already provides these objects.
-- Emulates the parts of Supabase Auth that the migrations depend on, so the same
-- migrations + RLS policies run on embedded PGlite for local dev and tests.
create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key,
  email text unique not null,
  created_at timestamptz not null default now()
);

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::json ->> 'sub', '')::uuid
$$;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated;

-- local credential store (Supabase Auth replaces this in hosted mode)
create table if not exists auth.local_credentials (
  user_id uuid primary key references auth.users(id) on delete cascade,
  password_hash text not null
);
