-- 0012_admin_departments.sql -------------------------------------------------
-- T-12a: admin-only department CRUD. `departments` has SELECT-only RLS (0001)
-- and no client write policies; these SECURITY DEFINER functions are the only
-- writers, and every mutation appends an audit row.
--
-- Deletion is deliberately strict. Profiles, applications, approval steps and
-- rules all reference departments with NO ACTION, and history must never be
-- cascaded away. The function refuses with exact reference counts so an admin
-- knows what to reassign; a concurrent FK insert is caught the same way.

-- Field contract shared by create/update so the validation copy cannot drift.
create or replace function private.assert_department_fields(
  p_name text,
  p_code text
) returns void
language plpgsql immutable
set search_path = public
as $$
begin
  if length(p_name) < 2 or length(p_name) > 80 then
    raise exception 'Department name must be 2-80 characters' using errcode = 'P0001';
  end if;
  if p_code !~ '^[A-Z0-9-]{2,12}$' then
    raise exception 'Department code must be 2-12 characters (A-Z, 0-9, hyphen)'
      using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function private.assert_department_fields(text, text)
  from public, anon, authenticated, service_role;

-- fn_admin_create_department --------------------------------------------------
create or replace function public.fn_admin_create_department(
  p_name text,
  p_code text
) returns public.departments
language plpgsql security definer volatile
set search_path = public
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_dept public.departments;
begin
  -- `is not true` fails closed when the caller has no profile row: is_admin()
  -- returns NULL there, and `not NULL` is NULL (i.e. would pass the guard).
  if public.is_admin() is not true then
    raise exception 'Only administrators may manage departments' using errcode = 'P0001';
  end if;

  perform private.assert_department_fields(v_name, v_code);

  insert into public.departments (name, code)
  values (v_name, v_code)
  returning * into v_dept;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (
    (select auth.uid()),
    'admin.department_created',
    'department',
    v_dept.id,
    jsonb_build_object('name', v_dept.name, 'code', v_dept.code)
  );

  return v_dept;
exception
  when unique_violation then
    raise exception 'A department with this name or code already exists'
      using errcode = 'P0001';
end;
$$;

revoke execute on function public.fn_admin_create_department(text, text) from anon, public;
grant execute on function public.fn_admin_create_department(text, text) to authenticated;

-- fn_admin_update_department --------------------------------------------------
create or replace function public.fn_admin_update_department(
  p_id uuid,
  p_name text,
  p_code text
) returns public.departments
language plpgsql security definer volatile
set search_path = public
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_dept public.departments;
begin
  if public.is_admin() is not true then
    raise exception 'Only administrators may manage departments' using errcode = 'P0001';
  end if;

  perform private.assert_department_fields(v_name, v_code);

  update public.departments
     set name = v_name,
         code = v_code
   where id = p_id
  returning * into v_dept;

  if not found then
    raise exception 'Department not found' using errcode = 'P0001';
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (
    (select auth.uid()),
    'admin.department_updated',
    'department',
    v_dept.id,
    jsonb_build_object('name', v_dept.name, 'code', v_dept.code)
  );

  return v_dept;
exception
  when unique_violation then
    raise exception 'A department with this name or code already exists'
      using errcode = 'P0001';
end;
$$;

revoke execute on function public.fn_admin_update_department(uuid, text, text)
  from anon, public;
grant execute on function public.fn_admin_update_department(uuid, text, text)
  to authenticated;

-- fn_admin_delete_department --------------------------------------------------
-- Only an unreferenced department can be deleted; there is no cascade path.
create or replace function public.fn_admin_delete_department(
  p_id uuid
) returns void
language plpgsql security definer volatile
set search_path = public
as $$
declare
  v_dept     public.departments;
  v_profiles bigint;
  v_apps     bigint;
  v_steps    bigint;
  v_rules    bigint;
begin
  if public.is_admin() is not true then
    raise exception 'Only administrators may manage departments' using errcode = 'P0001';
  end if;

  select * into v_dept from public.departments where id = p_id;
  if not found then
    raise exception 'Department not found' using errcode = 'P0001';
  end if;

  select count(*) into v_profiles from public.profiles where department_id = p_id;
  select count(*) into v_apps from public.gate_pass_applications where department_id = p_id;
  select count(*) into v_steps from public.approval_steps where department_id = p_id;
  select count(*) into v_rules from public.approval_rules where department_id = p_id;

  if v_profiles + v_apps + v_steps + v_rules > 0 then
    raise exception
      'Department is still referenced (% profile(s), % application(s), % approval step(s), % rule(s)) - reassign or remove those records first',
      v_profiles, v_apps, v_steps, v_rules
      using errcode = 'P0001';
  end if;

  delete from public.departments where id = p_id;
  if not found then
    raise exception 'Department not found' using errcode = 'P0001';
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (
    (select auth.uid()),
    'admin.department_deleted',
    'department',
    v_dept.id,
    jsonb_build_object('name', v_dept.name, 'code', v_dept.code)
  );
exception
  when foreign_key_violation then
    raise exception 'Department is still referenced - reassign or remove those records first'
      using errcode = 'P0001';
end;
$$;

revoke execute on function public.fn_admin_delete_department(uuid) from anon, public;
grant execute on function public.fn_admin_delete_department(uuid) to authenticated;
