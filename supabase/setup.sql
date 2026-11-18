-- =====================================================================
-- MiRadio — database setup for Supabase
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- Safe to run more than once.
-- =====================================================================

-- One row per station sign-up --------------------------------------------
create table if not exists public.stations (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users (id) on delete cascade,
  station_name text not null check (char_length(station_name) between 1 and 60),
  genre        text,
  plan         text not null default 'free' check (plan in ('free', 'starter', 'pro', 'network')),
  owner_name   text,
  email        text,
  slug         text unique,
  status       text not null default 'pending' check (status in ('pending', 'approved', 'live', 'paused')),
  admin_note   text,
  created_at   timestamptz not null default now()
);
create index if not exists stations_owner_idx on public.stations (owner_id);

-- People allowed to see and manage every sign-up ---------------------------
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;
grant execute on function public.is_admin() to authenticated;

-- Row-level security: owners see their own station, admins see all ---------
alter table public.stations enable row level security;
alter table public.admins   enable row level security;

drop policy if exists "read own or admin"   on public.stations;
drop policy if exists "update own or admin" on public.stations;
drop policy if exists "admin delete"        on public.stations;

create policy "read own or admin" on public.stations
  for select to authenticated
  using (owner_id = auth.uid() or public.is_admin());

create policy "update own or admin" on public.stations
  for update to authenticated
  using (owner_id = auth.uid() or public.is_admin())
  with check (owner_id = auth.uid() or public.is_admin());

create policy "admin delete" on public.stations
  for delete to authenticated
  using (public.is_admin());

-- Owners may only rename their station or change its genre -----------------
create or replace function public.guard_station_update()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    new.owner_id   := old.owner_id;
    new.plan       := old.plan;
    new.status     := old.status;
    new.slug       := old.slug;
    new.email      := old.email;
    new.admin_note := old.admin_note;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_station_update on public.stations;
create trigger guard_station_update
  before update on public.stations
  for each row execute function public.guard_station_update();

-- Create the station row automatically when someone signs up ---------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  m    jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  name text  := left(btrim(coalesce(m ->> 'station_name', '')), 60);
  base text;
  s    text;
  n    int   := 0;
begin
  if name = '' then
    return new;
  end if;

  base := btrim(regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g'), '-');
  if base = '' then base := 'station'; end if;
  base := left(base, 40);
  s := base;
  while exists (select 1 from public.stations where slug = s) loop
    n := n + 1;
    s := base || '-' || n;
  end loop;

  insert into public.stations (owner_id, station_name, genre, plan, owner_name, email, slug)
  values (
    new.id,
    name,
    left(m ->> 'genre', 40),
    case when m ->> 'plan' in ('free', 'starter', 'pro', 'network') then m ->> 'plan' else 'free' end,
    left(m ->> 'owner_name', 80),
    new.email,
    s
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- AFTER you have signed up on the website yourself, make yourself the
-- admin by running this line with YOUR email address filled in:
--
--   insert into public.admins (user_id)
--   select id from auth.users where email = 'you@example.com'
--   on conflict do nothing;
-- ---------------------------------------------------------------------
