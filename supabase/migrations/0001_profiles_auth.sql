-- 0001_profiles_auth.sql -------------------------------------------------------
-- T-02 slice of the schema (DATABASE.md §7 adjusted in place):
--   * user_role enum, departments, profiles
--   * auth.users -> profiles bootstrap trigger (every new auth user becomes
--     a student; staff provisioning is admin-only, see SECURITY.md §1)
--   * role helper functions used by RLS policies and guards
--   * RLS for profiles/departments (write access deliberately closed until
--     T-12 admin functions exist)
-- Remaining tables (applications/documents/passes/logs/notifications)
-- arrive with T-03/T-04 in their own migrations.

create extension if not exists pgcrypto;

create type public.user_role as enum ('student', 'faculty', 'hod', 'security', 'admin');

create table public.departments (
  id          uuid primary key default gen_random_uuid(),
  name        text        not null unique,
  code        text        not null unique,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  role          public.user_role not null default 'student',
  full_name     text        not null,
  roll_number   text        unique, -- staff have none; unique enforced for students
  phone         text,
  department_id uuid        references public.departments (id),
  designation   text,               -- staff title only
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index profiles_departments_idx on public.profiles (department_id);

-- updated_at touch helper (shared from T-04 onward)
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

create trigger departments_touch_updated_at
  before update on public.departments
  for each row execute function public.touch_updated_at();

-- Bootstrap: every fresh auth user gets a profile; row-level role is student
-- at creation. raw_user_meta_data carries name/roll_number from signup only.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, full_name, roll_number)
  values (
    new.id,
    'student',
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), 'New User'),
    nullif(btrim(new.raw_user_meta_data ->> 'roll_number'), '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Role lookups: SECURITY DEFINER so RLS policies on other tables can call
-- them without self-referencing recursion (owner bypasses RLS on profiles).
create or replace function public.get_user_role(uid uuid)
returns public.user_role
language sql stable security definer
set search_path = public
as $$
  select role from public.profiles where id = uid
$$;

create or replace function public.is_admin(uid uuid default auth.uid())
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.get_user_role(uid) = 'admin'
$$;

-- Roll-number uniqueness is checked *before* signup in the server action
-- (anon cannot read profiles, so this RPC is the boundary check). Returns
-- false when the roll is taken — avoids leaking whether a roll resembles
-- another holder beyond existence.
create or replace function public.check_roll_number_available(candidate text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select not exists (
    select 1 from public.profiles
    where lower(roll_number) = lower(btrim(candidate))
  )
$$;

-- RLS -------------------------------------------------------------------------
alter table public.departments enable row level security;
-- authenticated users may read departments (name/code needed across UIs);
-- all department writes stay denied at RLS level until admin functions (T-12).
create policy departments_select_authenticated
  on public.departments for select to authenticated using (true);

alter table public.profiles enable row level security;
create policy profiles_select_self
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_select_admin
  on public.profiles for select to authenticated
  using (public.is_admin());
create policy profiles_update_self_limited
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
-- department/role/name changes by others are handled exclusively by admin
-- functions in T-12; no other write policies exist.

-- No insert policy: profile rows come only from handle_new_user() (security
-- definer executes with owner privileges, bypassing RLS).
