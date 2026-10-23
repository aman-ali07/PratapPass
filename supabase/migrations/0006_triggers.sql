-- 0006_triggers.sql ------------------------------------------------------------
-- T-04: cross-table behavior.
--
-- 1) Pass issuance fires when an application TRANSITIONS to `approved` — the
--    decision function only decides (DATABASE.md §5/§6); issuance is a separate,
--    idempotent-ish conflict (fn_issue_pass raises on a second attempt) guarded
--    by the gate_passes.application_id UNIQUE constraint. No recursion: issuance
--    writes gate_passes, not the application.
-- 2) Append-only enforcement becomes ABSOLUTE: BEFORE UPDATE / DELETE triggers
--    throw on approval_actions, gate_verification_logs, and audit_logs even for
--    the table owner / definer functions (grants cover client roles only — §3).
-- 3) No remaining `updated_at` touches: every timestamped table carries its
--    touch trigger from 0001/0003, and history tables are timeless by design.

-- 1) Approved → issue pass -------------------------------------------------------
create or replace function public.on_application_approved()
returns trigger
language plpgsql security definer
set search_path = public, extensions
as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    perform public.fn_issue_pass(new.id);
  end if;
  return new;
end;
$$;

revoke execute on function public.on_application_approved() from anon, authenticated, public;

create trigger passes_issue_on_approval
  after update of status on public.gate_pass_applications
  for each row
  execute function public.on_application_approved();

-- 2) Immutable history ------------------------------------------------------------
create or replace function public.forbid_history_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception '% is append-only: % denied', tg_table_name, tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger approval_actions_no_mutation
  before update or delete on public.approval_actions
  for each statement execute function public.forbid_history_mutation();

create trigger gate_verification_logs_no_mutation
  before update or delete on public.gate_verification_logs
  for each statement execute function public.forbid_history_mutation();

create trigger audit_logs_no_mutation
  before update or delete on public.audit_logs
  for each statement execute function public.forbid_history_mutation();
