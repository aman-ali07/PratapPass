-- 0013_admin_users.sql -------------------------------------------------------
-- T-12b: admin-only user provisioning, role/department changes, password-reset
-- auditing, and the admin list query. `profiles` stays non-writable by clients
-- (0002 column grants); these SECURITY DEFINER functions are the only writers
-- of role/department/roll/designation.
--
-- Guard rails:
--   * every function re-checks is_admin() (`is not true` fails closed);
--   * role changes serialize on pg_advisory_xact_lock BEFORE re-reading the
--     caller's role, so two admins demoting each other cannot both pass a stale
--     admin check and leave zero admins;
--   * self-role changes are refused;
--   * approvers with pending steps (assigned, or unassigned matching their
--     current role+department) cannot change role/department — the queue would
--     silently lose its owner;
--   * students with in-flight applications cannot be moved off the student
--     role — fn_provide_info requires it;
--   * students need a roll + department; faculty/HOD need a department; staff
--     never carry a roll number.
--
-- Password values never reach these functions: GoTrue hashes them, and the
-- action records the reset through fn_admin_record_password_reset (D-020).

-- Field contract shared by create/update so validation cannot drift.
create or replace function private.normalize_user_fields(
  p_role          public.user_role,
  p_full_name     text,
  p_roll_number   text,
  p_department_id uuid,
  p_designation   text
) returns table (full_name text, roll_number text, designation text)
language plpgsql stable
set search_path = public
as $$
declare
  v_name        text := btrim(regexp_replace(coalesce(p_full_name, ''), '[[:space:]]+', ' ', 'g'));
  v_roll        text := nullif(upper(btrim(coalesce(p_roll_number, ''))), '');
  v_designation text := nullif(btrim(coalesce(p_designation, '')), '');
begin
  if length(v_name) < 2 or length(v_name) > 80 then
    raise exception 'Full name must be 2-80 characters' using errcode = 'P0001';
  end if;
  if v_designation is not null and length(v_designation) > 80 then
    raise exception 'Designation must fit in 80 characters' using errcode = 'P0001';
  end if;
  if p_department_id is not null
     and not exists (select 1 from public.departments d where d.id = p_department_id) then
    raise exception 'Department not found' using errcode = 'P0001';
  end if;

  if p_role = 'student' then
    if v_roll is null then
      raise exception 'Students need a roll number' using errcode = 'P0001';
    end if;
    if v_roll !~ '^[A-Z0-9]{3,20}$' then
      raise exception 'Roll number must be 3-20 letters or digits' using errcode = 'P0001';
    end if;
    if p_department_id is null then
      raise exception 'Students need a department assignment' using errcode = 'P0001';
    end if;
    v_designation := null;
  elsif p_role in ('faculty', 'hod') then
    if p_department_id is null then
      raise exception 'Faculty and HOD accounts need a department' using errcode = 'P0001';
    end if;
    v_roll := null;
  else
    -- security / admin: no roll number; department optional.
    v_roll := null;
  end if;

  return query select v_name, v_roll, v_designation;
end;
$$;

revoke all on function private.normalize_user_fields(
  public.user_role, text, text, uuid, text
) from public, anon, authenticated, service_role;

-- fn_admin_list_users ---------------------------------------------------------
-- Admin directory: profiles joined to auth.users for email (profiles has no
-- email column). Capped at 100 rows; total_count lets the UI say how much is
-- hidden and prompt for a narrower search.
create or replace function public.fn_admin_list_users(
  p_search  text default null,
  p_role    public.user_role default null,
  p_user_id uuid default null
) returns table (
  id              uuid,
  email           text,
  full_name       text,
  role            public.user_role,
  roll_number     text,
  department_id   uuid,
  department_code text,
  department_name text,
  designation     text,
  created_at      timestamptz,
  updated_at      timestamptz,
  total_count     bigint
)
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
begin
  if public.is_admin() is not true then
    raise exception 'Only administrators may manage users' using errcode = 'P0001';
  end if;

  return query
  select
    p.id,
    coalesce(u.email, '')::text,
    p.full_name,
    p.role,
    p.roll_number,
    p.department_id,
    d.code,
    d.name,
    p.designation,
    p.created_at,
    p.updated_at,
    count(*) over () as total_count
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.departments d on d.id = p.department_id
  where (p_user_id is null or p.id = p_user_id)
    and (p_role is null or p.role = p_role)
    and (
      v_search is null
      or position(lower(v_search) in lower(p.full_name)) > 0
      or position(lower(v_search) in lower(coalesce(p.roll_number, ''))) > 0
      or position(lower(v_search) in lower(coalesce(u.email, ''))) > 0
    )
  order by p.role, p.full_name
  limit 100;
end;
$$;

revoke execute on function public.fn_admin_list_users(text, public.user_role, uuid)
  from anon, public;
grant execute on function public.fn_admin_list_users(text, public.user_role, uuid)
  to authenticated;

-- fn_admin_create_user --------------------------------------------------------
-- Finalizes the profile of an auth user created moments earlier by the action
-- (GoTrue owns password hashing). The auth.users trigger has already inserted
-- the student-shaped profile; this sets the requested role/department.
create or replace function public.fn_admin_create_user(
  p_user_id       uuid,
  p_full_name     text,
  p_role          public.user_role,
  p_department_id uuid,
  p_roll_number   text,
  p_designation   text
) returns public.profiles
language plpgsql security definer volatile
set search_path = public
as $$
declare
  v_name        text;
  v_roll        text;
  v_designation text;
  v_profile     public.profiles;
begin
  if public.is_admin() is not true then
    raise exception 'Only administrators may manage users' using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'User account not found - create the sign-in account first'
      using errcode = 'P0001';
  end if;

  select n.full_name, n.roll_number, n.designation
    into v_name, v_roll, v_designation
    from private.normalize_user_fields(
      p_role, p_full_name, p_roll_number, p_department_id, p_designation
    ) n;

  update public.profiles
     set role          = p_role,
         full_name     = v_name,
         roll_number   = v_roll,
         department_id = p_department_id,
         designation   = v_designation
   where id = p_user_id
  returning * into v_profile;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (
    (select auth.uid()),
    'admin.user_created',
    'user',
    v_profile.id,
    jsonb_build_object('role', v_profile.role, 'department_id', v_profile.department_id)
  );

  return v_profile;
exception
  when unique_violation then
    raise exception 'This roll number is already registered' using errcode = 'P0001';
  when foreign_key_violation then
    raise exception 'Department not found' using errcode = 'P0001';
end;
$$;

revoke execute on function public.fn_admin_create_user(
  uuid, text, public.user_role, uuid, text, text
) from anon, public;
grant execute on function public.fn_admin_create_user(
  uuid, text, public.user_role, uuid, text, text
) to authenticated;

-- fn_admin_update_user --------------------------------------------------------
-- Role/department changes. The advisory lock is taken before the admin re-check
-- so a concurrent demotion is visible: without it, two admins could each pass a
-- stale is_admin() and demote the other, leaving the system with no admin.
create or replace function public.fn_admin_update_user(
  p_user_id       uuid,
  p_full_name     text,
  p_role          public.user_role,
  p_department_id uuid,
  p_roll_number   text,
  p_designation   text
) returns public.profiles
language plpgsql security definer volatile
set search_path = public
as $$
declare
  v_actor       uuid := (select auth.uid());
  v_target      public.profiles;
  v_name        text;
  v_roll        text;
  v_designation text;
  v_profile     public.profiles;
  v_other_admins bigint;
  v_assigned    bigint;
  v_unassigned  bigint;
  v_open_apps   bigint;
begin
  -- 730421 is the admin-console lock namespace (D-019).
  perform pg_advisory_xact_lock(730421);

  if public.is_admin() is not true then
    raise exception 'Only administrators may manage users' using errcode = 'P0001';
  end if;

  select * into v_target from public.profiles where id = p_user_id;
  if not found then
    raise exception 'User not found' using errcode = 'P0001';
  end if;

  if p_user_id = v_actor and p_role is distinct from v_target.role then
    raise exception 'You cannot change your own role' using errcode = 'P0001';
  end if;

  if v_target.role = 'admin' and p_role is distinct from 'admin'::public.user_role then
    select count(*) into v_other_admins
    from public.profiles
    where role = 'admin' and id <> p_user_id;
    if v_other_admins = 0 then
      raise exception 'The last administrator cannot be demoted - promote another administrator first'
        using errcode = 'P0001';
    end if;
  end if;

  if v_target.role in ('faculty', 'hod')
     and (p_role is distinct from v_target.role
          or p_department_id is distinct from v_target.department_id) then
    select count(*) into v_assigned
    from public.approval_steps
    where assigned_to = p_user_id and status = 'pending';

    select count(*) into v_unassigned
    from public.approval_steps
    where assigned_to is null
      and status = 'pending'
      and approver_role = v_target.role
      and department_id = v_target.department_id;

    if v_assigned + v_unassigned > 0 then
      raise exception
        'This approver still has % pending approval step(s) - reassign or resolve them before changing the role or department',
        v_assigned + v_unassigned
        using errcode = 'P0001';
    end if;
  end if;

  if v_target.role = 'student' and p_role is distinct from 'student'::public.user_role then
    select count(*) into v_open_apps
    from public.gate_pass_applications
    where student_id = p_user_id
      and status not in ('completed', 'rejected');
    if v_open_apps > 0 then
      raise exception
        'This student has % application(s) in progress - resolve them before changing the role',
        v_open_apps
        using errcode = 'P0001';
    end if;
  end if;

  select n.full_name, n.roll_number, n.designation
    into v_name, v_roll, v_designation
    from private.normalize_user_fields(
      p_role, p_full_name, p_roll_number, p_department_id, p_designation
    ) n;

  update public.profiles
     set role          = p_role,
         full_name     = v_name,
         roll_number   = v_roll,
         department_id = p_department_id,
         designation   = v_designation
   where id = p_user_id
  returning * into v_profile;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.user_updated',
    'user',
    v_profile.id,
    jsonb_build_object(
      'role', v_profile.role,
      'previous_role', v_target.role,
      'department_id', v_profile.department_id,
      'previous_department_id', v_target.department_id
    )
  );

  return v_profile;
exception
  when unique_violation then
    raise exception 'This roll number is already registered' using errcode = 'P0001';
  when foreign_key_violation then
    raise exception 'Department not found' using errcode = 'P0001';
end;
$$;

revoke execute on function public.fn_admin_update_user(
  uuid, text, public.user_role, uuid, text, text
) from anon, public;
grant execute on function public.fn_admin_update_user(
  uuid, text, public.user_role, uuid, text, text
) to authenticated;

-- fn_admin_record_password_reset ----------------------------------------------
-- GoTrue performs the hash update (service role, after an authoritative
-- is_admin() pre-check); this records the administrative action. Deliberately
-- takes no password value — secrets never enter the audit trail (D-020).
create or replace function public.fn_admin_record_password_reset(
  p_user_id uuid
) returns void
language plpgsql security definer volatile
set search_path = public
as $$
begin
  if public.is_admin() is not true then
    raise exception 'Only administrators may manage users' using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'User not found' using errcode = 'P0001';
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (
    (select auth.uid()),
    'admin.user_password_reset',
    'user',
    p_user_id,
    '{}'::jsonb
  );
end;
$$;

revoke execute on function public.fn_admin_record_password_reset(uuid) from anon, public;
grant execute on function public.fn_admin_record_password_reset(uuid) to authenticated;
