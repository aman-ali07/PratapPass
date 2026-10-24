-- 0011_gate_verify_fn.sql ----------------------------------------------------------
-- T-11: PUBLIC read-only classification for `/verify` and `/api/gate/verify`.
-- fn_gate_record stays the recording authority (security/admin, writes the
-- append-only log); this function never writes: gate_verification_logs has
-- `gate_user_id NOT NULL`, so an anonymous attempt is unloggable BY SCHEMA —
-- only authenticated recording attempts produce log rows (D-018).
--
-- ANON SURFACE: raw 64-hex tokens ONLY. MPGI-* pass codes are 24-bit human
-- identifiers (3 random bytes) and must never be enumerable anonymously;
-- signed-in security/admin may also classify by code (the same rule that lets
-- them record by code in fn_gate_record). Unknown/refused probes return
-- `invalid_token` and reveal nothing.
--
-- Resolution mirrors fn_gate_record's lookup; payload is holder name + pass
-- code + department + validity window + exit state — NEVER reason text,
-- explanation, or medical anything (SECURITY.md §3).

create or replace function public.fn_gate_verify(p_token_or_code text)
returns jsonb
language plpgsql security definer stable
set search_path = public, extensions   -- pgcrypto: digest (token-hash compare)
as $$
declare
  v_role       public.user_role := public.get_user_role((select auth.uid()));
  v_probe      text := trim(coalesce(p_token_or_code, ''));
  v_has_hash   boolean;
  v_pass       public.gate_passes;
  v_exit_state text;
  v_result     text;
begin
  if v_probe = '' then
    return jsonb_build_object('result', 'invalid_token');
  end if;

  v_has_hash := v_probe ~ '^[0-9a-f]{64}$';

  -- Public callers: token shape required (NULL role must fail this check —
  -- `NOT IN` alone would be NULL, i.e. pass-through, for anon).
  if not v_has_hash
     and (v_role is null or v_role not in ('security', 'admin')) then
    return jsonb_build_object('result', 'invalid_token');
  end if;

  select * into v_pass from public.gate_passes
  where (v_has_hash and token_hash = encode(digest(v_probe, 'sha256'), 'hex'))
     or (not v_has_hash
         and pass_code = upper(v_probe) and upper(v_probe) like 'MPGI-%')
  limit 1;
  if not found then
    return jsonb_build_object('result', 'invalid_token');
  end if;

  select case
    when exists (
      select 1 from public.gate_verification_logs
      where pass_id = v_pass.id and event = 'return' and result = 'valid'
    ) then 'returned'
    when exists (
      select 1 from public.gate_verification_logs
      where pass_id = v_pass.id and event = 'exit' and result = 'valid'
    ) then 'exited'
    else 'not_exited'
  end into v_exit_state;

  -- Scan-time classification. Event-specific refusals (already_exited on an
  -- exit attempt, staff_rejected on a return without exit) belong to
  -- fn_gate_record; the read-only view reports where the pass stands.
  v_result := case
    when v_pass.revoked_at is not null then 'revoked'
    when v_exit_state = 'returned' then 'already_returned'
    when v_exit_state = 'exited' then 'already_exited'
    when now() < v_pass.valid_from or now() > v_pass.expires_at then 'expired'
    else 'valid'
  end;

  return jsonb_build_object(
    'result', v_result,
    'pass_code', v_pass.pass_code,
    'holder', (
      select p.full_name from public.profiles p
      where p.id = (select a.student_id from public.gate_pass_applications a
                    where a.id = v_pass.application_id)
    ),
    'department', (
      select d.name from public.departments d
      where d.id = (select a.department_id from public.gate_pass_applications a
                    where a.id = v_pass.application_id)
    ),
    'valid_from', v_pass.valid_from,
    'expires_at', v_pass.expires_at,
    'revoked_at', v_pass.revoked_at,
    'exit_state', v_exit_state
  );
end;
$$;

revoke execute on function public.fn_gate_verify(text) from public;
grant  execute on function public.fn_gate_verify(text) to anon, authenticated;
