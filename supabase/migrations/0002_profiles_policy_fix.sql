-- 0002_profiles_policy_fix.sql -------------------------------------------------
-- T-02a security hotfix amending 0001 (0001 is committed and never mutated):
--  P0 — 0001's self-update policy had no column restriction, so any
--       authenticated user could set their own row's role/department_id —
--       one-call admin escalation through the RLS role authority itself.
--       DATABASE.md §2 is normative: users may edit own full_name/phone only.
--  P1 — roll-number uniqueness was case-sensitive while the availability RPC
--       folds case; concurrent or mixed-case registrations slipped the
--       pre-check and died inside the bootstrap trigger with a raw error.
--  Hygiene — role helpers defaulted to PUBLIC execution (a role-enumeration
--       surface for anon). Registration only needs the roll-check RPC.
-- 0001 must always be replayed together with this file (db reset does so).

-- 1) Self-update restricted to full_name/phone --------------------------------
-- PostgreSQL has no column lists in CREATE POLICY, so scope comes from two
-- layers: a table-level policy for the row boundary (own id only) and column
-- GRANTs for the write boundary. Postgres default privileges grant ALL to
-- anon/authenticated, so the table UPDATE is first fully revoked.
drop policy if exists profiles_update_self_limited on public.profiles;
create policy profiles_update_self_limited
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

revoke update on table public.profiles from anon, authenticated;
grant update (full_name, phone) on table public.profiles to authenticated;

-- 2) Case-insensitive roll-number uniqueness (matches the RPC's lower()) ------
alter table public.profiles drop constraint profiles_roll_number_key;
create unique index profiles_roll_number_unique_ci
  on public.profiles (lower(roll_number))
  where roll_number is not null;

-- 3) Helper execution surface -----------------------------------
-- Policies evaluate functions with the querying role's EXECUTE privilege, so
-- authenticated keeps access. Supabase default privileges grant EXECUTE to
-- anon/authenticated/service_role explicitly at creation (visible as `anon=X/…`
-- in proacl), so a PUBLIC-only REVOKE is NOT enough — anon must be revoked by
-- name, otherwise any anonymous caller can probe arbitrary UUIDs for admin
-- status. check_roll_number_available stays anon-callable: it is the
-- registration boundary check (SECURITY.md §5).
-- handle_new_user is deliberately left executable: trigger invocation passes
-- through the auth plugin's DB role, trigger-returning functions cannot be
-- called as PostgREST RPCs, and revoking risks the auth insert path.
revoke execute on function public.get_user_role(uuid) from anon, public;
revoke execute on function public.is_admin(uuid) from anon, public;
grant execute on function public.get_user_role(uuid) to authenticated;
grant execute on function public.is_admin(uuid) to authenticated;
