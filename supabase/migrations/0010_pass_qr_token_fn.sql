-- 0010_pass_qr_token_fn.sql -------------------------------------------------------
-- T-10: re-derive the RAW QR token for the student pass surface. D-015 stores
-- only the SHA-256 digest of the deterministic token raw = hmac(data=secret,
-- key=pass_id) — the SAME pgcrypto argument order as fn_issue_pass — so no raw
-- credential is ever persisted and it is recomputed on demand. The private
-- schema is NOT exposed through PostgREST (config.toml [api].schemas), so the
-- recompute lives in this SECURITY DEFINER function: callers must be the pass's
-- OWN student or an admin, and the digest must round-trip against token_hash or
-- the read FAILS LOUDLY — a rotated secret is an explicit error, never a
-- silently wrong QR. Gate security is deliberately NOT a caller here: their
-- verification path is the raw token itself (fn_gate_record), never pass ids.

create or replace function public.fn_pass_qr_token(p_pass_id uuid)
returns text
language plpgsql security definer volatile
set search_path = public, extensions   -- pgcrypto: hmac / digest
as $$
declare
  v_pass   public.gate_passes;
  v_role   public.user_role := public.get_user_role((select auth.uid()));
  v_secret text;
  v_raw    text;
begin
  select * into v_pass from public.gate_passes where id = p_pass_id;
  if not found then
    raise exception 'Pass not found' using errcode = 'P0001';
  end if;

  if v_role = 'student' then
    if not exists (
      select 1 from public.gate_pass_applications a
      where a.id = v_pass.application_id
        and a.student_id = (select auth.uid())
    ) then
      raise exception 'You cannot view this pass' using errcode = 'P0001';
    end if;
  elsif v_role is distinct from 'admin' then
    raise exception 'You cannot view this pass' using errcode = 'P0001';
  end if;

  select value into v_secret from private.app_secrets where name = 'qr_token_secret';
  if v_secret is null then
    raise exception 'QR token secret is not configured — contact the administration'
      using errcode = 'P0001';
  end if;

  v_raw := encode(hmac(v_secret, p_pass_id::text, 'sha256'), 'hex');
  if encode(digest(v_raw, 'sha256'), 'hex') is distinct from v_pass.token_hash then
    raise exception 'Pass token verification failed — QR secret appears rotated'
      using errcode = 'P0001';
  end if;

  return v_raw;
end;
$$;

revoke execute on function public.fn_pass_qr_token(uuid) from anon, public;
grant  execute on function public.fn_pass_qr_token(uuid) to authenticated;
