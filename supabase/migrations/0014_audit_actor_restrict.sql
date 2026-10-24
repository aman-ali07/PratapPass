-- 0014_audit_actor_restrict.sql ----------------------------------------------
-- The 0006 append-only guard is a STATEMENT-level trigger, so the RI action for
-- `audit_logs.actor_id ON DELETE SET NULL` fires an UPDATE on audit_logs even
-- when no row matches — and the guard rejects it. Net effect: NO profile could
-- ever be deleted, including a just-provisioned account whose creation failed
-- before any audit row named it as actor.
--
-- RESTRICT states the real invariant instead: a user with audit history can
-- never be deleted, while an account with no history can be rolled back when
-- provisioning fails (T-12b). The admin UI still exposes no deletion (D-020).
-- `approval_actions.actor_id` and `gate_verification_logs.gate_user_id` already
-- use NO ACTION, so decisions and gate scans are equally protected.

alter table public.audit_logs drop constraint audit_logs_actor_id_fkey;
alter table public.audit_logs add constraint audit_logs_actor_id_fkey
  foreign key (actor_id) references public.profiles (id) on delete restrict;
