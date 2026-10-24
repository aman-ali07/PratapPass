-- 0015_admin_rules.sql --------------------------------------------------------
-- T-12c: admin-only approval-rule management. `approval_rules` stays
-- non-writable by clients (0003 revokes INSERT/UPDATE/DELETE; 0004 lets admins
-- SELECT only), so these SECURITY DEFINER functions are the only writers.
--
-- Contract:
--   * every function re-checks is_admin() (`is not true` fails closed);
--   * chain is 1-2 distinct roles from {faculty, hod}; emergency is ALWAYS
--     ["hod"] (D-007, also a table CHECK);
--   * pass validity is 1-720 hours;
--   * global defaults (department_id IS NULL) are editable but NOT deletable —
--     deleting a department override reverts that department to the global rule;
--   * create/update/delete append admin.rule_* audit rows (reason, department,
--     chain and flags only — no PII).
--
-- Baseline fix: the T-05 seed never created a global `other` rule, so `other`
-- submissions failed with "No approval rule is configured". Every gate_reason
-- now has a global default; the insert is idempotent.

insert into public.approval_rules (
  department_id, reason, chain, requires_medical_document, pass_validity_hours
)
select null, 'other', '["faculty","hod"]'::jsonb, false, 12
where not exists (
  select 1 from public.approval_rules
  where department_id is null and reason = 'other'
);

-- Shared field contract for create/update so validation cannot drift.
create or replace function private.assert_rule_fields(
  p_reason                   public.gate_reason,
  p_chain                    jsonb,
  p_requires_medical_document boolean,
  p_pass_validity_hours      int
) returns void
language plpgsql immutable
set search_path = public
as $$
declare
  v_len int;
begin
  if p_reason is null then
    raise exception 'Choose a request type' using errcode = 'P0001';
  end if;

  if p_chain is null or jsonb_typeof(p_chain) is distinct from 'array' then
    raise exception 'Approval chain must be an array of roles' using errcode = 'P0001';
  end if;
  v_len := jsonb_array_length(p_chain);
  if v_len < 1 or v_len > 2 then
    raise exception 'Approval chain must have one or two steps' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from jsonb_array_elements_text(p_chain) as role
    where role not in ('faculty', 'hod')
  ) then
    raise exception 'Approval chain roles must be faculty or hod' using errcode = 'P0001';
  end if;
  if (
    select count(distinct role) from jsonb_array_elements_text(p_chain) as role
  ) <> v_len then
    raise exception 'Approval chain cannot repeat a role' using errcode = 'P0001';
  end if;

  if p_requires_medical_document is null then
    raise exception 'Choose whether a medical document is required' using errcode = 'P0001';
  end if;

  if p_pass_validity_hours is null
     or p_pass_validity_hours not between 1 and 720 then
    raise exception 'Pass validity must be between 1 and 720 hours' using errcode = 'P0001';
  end if;

  if p_reason = 'emergency' and p_chain is distinct from '["hod"]'::jsonb then
    raise exception 'Emergency requests always route directly to the HOD' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function private.assert_rule_fields(
  public.gate_reason, jsonb, boolean, int
) from public, anon, authenticated, service_role;

-- fn_admin_list_rules ---------------------------------------------------------
-- The rules matrix: global defaults (department_id NULL) plus department
-- overrides. An optional id backs the edit page.
create or replace function public.fn_admin_list_rules(
  p_rule_id uuid default null
) returns table (
  id                        uuid,
  department_id             uuid,
  department_code           text,
  department_name           text,
  reason                    public.gate_reason,
  chain                     jsonb,
  requires_medical_document boolean,
  pass_validity_hours       int,
  created_at                timestamptz,
  updated_at                timestamptz
)
language plpgsql stable security definer
set search_path = public
as $$
begin
  if public.is_admin() is not true then
    raise exception 'Only administrators may manage approval rules' using errcode = 'P0001';
  end if;

  return query
  select
    r.id,
    r.department_id,
    d.code,
    d.name,
    r.reason,
    r.chain,
    r.requires_medical_document,
    r.pass_validity_hours,
    r.created_at,
    r.updated_at
  from public.approval_rules r
  left join public.departments d on d.id = r.department_id
  where p_rule_id is null or r.id = p_rule_id
  order by r.reason, r.department_id nulls first, d.code;
end;
$$;

revoke execute on function public.fn_admin_list_rules(uuid) from anon, public;
grant execute on function public.fn_admin_list_rules(uuid) to authenticated;

-- fn_admin_create_rule --------------------------------------------------------
create or replace function public.fn_admin_create_rule(
  p_department_id            uuid,
  p_reason                   public.gate_reason,
  p_chain                    jsonb,
  p_requires_medical_document boolean,
  p_pass_validity_hours      int
) returns public.approval_rules
language plpgsql security definer volatile
set search_path = public
as $$
declare
  v_rule public.approval_rules;
begin
  if public.is_admin() is not true then
    raise exception 'Only administrators may manage approval rules' using errcode = 'P0001';
  end if;

  if p_department_id is not null
     and not exists (select 1 from public.departments d where d.id = p_department_id) then
    raise exception 'Department not found' using errcode = 'P0001';
  end if;

  perform private.assert_rule_fields(
    p_reason, p_chain, p_requires_medical_document, p_pass_validity_hours
  );

  insert into public.approval_rules (
    department_id, reason, chain, requires_medical_document, pass_validity_hours
  ) values (
    p_department_id, p_reason, p_chain, p_requires_medical_document, p_pass_validity_hours
  ) returning * into v_rule;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (
    (select auth.uid()),
    'admin.rule_created',
    'approval_rule',
    v_rule.id,
    jsonb_build_object(
      'reason', v_rule.reason,
      'department_id', v_rule.department_id,
      'chain', v_rule.chain,
      'requires_medical_document', v_rule.requires_medical_document,
      'pass_validity_hours', v_rule.pass_validity_hours
    )
  );

  return v_rule;
exception
  when unique_violation then
    raise exception 'A rule for this department and request type already exists - edit it instead'
      using errcode = 'P0001';
end;
$$;

revoke execute on function public.fn_admin_create_rule(
  uuid, public.gate_reason, jsonb, boolean, int
) from anon, public;
grant execute on function public.fn_admin_create_rule(
  uuid, public.gate_reason, jsonb, boolean, int
) to authenticated;

-- fn_admin_update_rule --------------------------------------------------------
-- The (department, reason) key is immutable: changing it would silently move a
-- rule between scopes. Create the new pair and delete the old override instead.
create or replace function public.fn_admin_update_rule(
  p_id                       uuid,
  p_chain                    jsonb,
  p_requires_medical_document boolean,
  p_pass_validity_hours      int
) returns public.approval_rules
language plpgsql security definer volatile
set search_path = public
as $$
declare
  v_previous public.approval_rules;
  v_rule     public.approval_rules;
begin
  if public.is_admin() is not true then
    raise exception 'Only administrators may manage approval rules' using errcode = 'P0001';
  end if;

  select * into v_previous from public.approval_rules where id = p_id for update;
  if not found then
    raise exception 'Rule not found' using errcode = 'P0001';
  end if;

  perform private.assert_rule_fields(
    v_previous.reason, p_chain, p_requires_medical_document, p_pass_validity_hours
  );

  update public.approval_rules
     set chain                     = p_chain,
         requires_medical_document = p_requires_medical_document,
         pass_validity_hours       = p_pass_validity_hours
   where id = p_id
  returning * into v_rule;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (
    (select auth.uid()),
    'admin.rule_updated',
    'approval_rule',
    v_rule.id,
    jsonb_build_object(
      'reason', v_rule.reason,
      'department_id', v_rule.department_id,
      'previous_chain', v_previous.chain,
      'chain', v_rule.chain,
      'requires_medical_document', v_rule.requires_medical_document,
      'pass_validity_hours', v_rule.pass_validity_hours
    )
  );

  return v_rule;
end;
$$;

revoke execute on function public.fn_admin_update_rule(uuid, jsonb, boolean, int)
  from anon, public;
grant execute on function public.fn_admin_update_rule(uuid, jsonb, boolean, int)
  to authenticated;

-- fn_admin_delete_rule --------------------------------------------------------
-- Only department overrides are deletable; deleting one reverts that department
-- to the global default. Global defaults stay editable so every reason always
-- has a fallback (fn_submit_application / fn_issue_pass rely on it).
create or replace function public.fn_admin_delete_rule(
  p_id uuid
) returns void
language plpgsql security definer volatile
set search_path = public
as $$
declare
  v_rule public.approval_rules;
begin
  if public.is_admin() is not true then
    raise exception 'Only administrators may manage approval rules' using errcode = 'P0001';
  end if;

  select * into v_rule from public.approval_rules where id = p_id for update;
  if not found then
    raise exception 'Rule not found' using errcode = 'P0001';
  end if;

  if v_rule.department_id is null then
    raise exception 'Global default rules cannot be deleted - edit it instead'
      using errcode = 'P0001';
  end if;

  delete from public.approval_rules where id = p_id;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (
    (select auth.uid()),
    'admin.rule_deleted',
    'approval_rule',
    v_rule.id,
    jsonb_build_object(
      'reason', v_rule.reason,
      'department_id', v_rule.department_id,
      'chain', v_rule.chain
    )
  );
end;
$$;

revoke execute on function public.fn_admin_delete_rule(uuid) from anon, public;
grant execute on function public.fn_admin_delete_rule(uuid) to authenticated;
