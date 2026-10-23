-- 0004_rls_policy_matrix.sql ---------------------------------------------------
-- T-03: row-level security for the application tables (0003). Design rules
-- (DATABASE.md §2, D-014):
--  * Writes are ALWAYS denied for clients (grants revoked in 0003 and no
--    INSERT/UPDATE/DELETE policies exist) — every mutation flows through
--    SECURITY DEFINER functions, which run as the table owner and bypass RLS.
--  * SELECT is scoped: student = own rows; faculty/hod = own department
--    (explicit assignment respected); admin = all; security = function-only.
--  * Policy predicates never scan `profiles` directly (audit-safe: helpers are
--    SECURITY DEFINER → no RLS recursion).
--  * Supabase default privileges re-grant EXECUTE to anon/authenticated on
--    every new function, so anon revocation is repeated here explicitly
--    (0002 lesson: PUBLIC-only REVOKE is a no-op).

alter table public.gate_pass_applications  enable row level security;
alter table public.medical_documents       enable row level security;
alter table public.approval_steps          enable row level security;
alter table public.approval_actions        enable row level security;
alter table public.gate_passes             enable row level security;
alter table public.gate_verification_logs  enable row level security;
alter table public.notifications           enable row level security;
alter table public.audit_logs              enable row level security;
alter table public.approval_rules          enable row level security;

-- Scope helper: actor's department (definer → safe to use inside policies) -----
create or replace function public.get_user_department(uid uuid)
returns uuid
language sql stable security definer
set search_path = public
as $$
  select department_id from public.profiles where id = uid
$$;

revoke execute on function public.get_user_department(uuid) from anon, public;
grant execute on function public.get_user_department(uuid) to authenticated;

-- gate_pass_applications --------------------------------------------------------
create policy applications_select_student_own
  on public.gate_pass_applications for select to authenticated
  using (
    student_id = (select auth.uid())
    and public.get_user_role((select auth.uid())) = 'student'
  );
create policy applications_select_department_staff
  on public.gate_pass_applications for select to authenticated
  using (
    public.get_user_role((select auth.uid())) in ('faculty', 'hod')
    and department_id = public.get_user_department((select auth.uid()))
  );
create policy applications_select_admin
  on public.gate_pass_applications for select to authenticated
  using (public.is_admin());

-- medical_documents: reachable only through the owning application's scope -----
create policy documents_select_student_own
  on public.medical_documents for select to authenticated
  using (
    public.get_user_role((select auth.uid())) = 'student'
    and exists (
      select 1 from public.gate_pass_applications a
      where a.id = application_id
        and a.student_id = (select auth.uid())
    )
  );
create policy documents_select_department_staff
  on public.medical_documents for select to authenticated
  using (
    public.get_user_role((select auth.uid())) in ('faculty', 'hod')
    and exists (
      select 1 from public.gate_pass_applications a
      where a.id = application_id
        and a.department_id = public.get_user_department((select auth.uid()))
    )
  );
create policy documents_select_admin
  on public.medical_documents for select to authenticated
  using (public.is_admin());

-- approval_steps: student timeline read; staff queue read; assignment honored ---
create policy steps_select_student_own
  on public.approval_steps for select to authenticated
  using (
    public.get_user_role((select auth.uid())) = 'student'
    and exists (
      select 1 from public.gate_pass_applications a
      where a.id = application_id
        and a.student_id = (select auth.uid())
    )
  );
create policy steps_select_staff
  on public.approval_steps for select to authenticated
  using (
    public.get_user_role((select auth.uid())) in ('faculty', 'hod')
    and (
      assigned_to = (select auth.uid())
      or (
        assigned_to is null
        and department_id = public.get_user_department((select auth.uid()))
      )
    )
  );
create policy steps_select_admin
  on public.approval_steps for select to authenticated
  using (public.is_admin());

-- approval_actions: history readable by the same scopes as steps ---------------
create policy actions_select_student_own
  on public.approval_actions for select to authenticated
  using (
    public.get_user_role((select auth.uid())) = 'student'
    and exists (
      select 1 from public.gate_pass_applications a
      where a.id = application_id
        and a.student_id = (select auth.uid())
    )
  );
create policy actions_select_department_staff
  on public.approval_actions for select to authenticated
  using (
    public.get_user_role((select auth.uid())) in ('faculty', 'hod')
    and exists (
      select 1 from public.gate_pass_applications a
      where a.id = application_id
        and a.department_id = public.get_user_department((select auth.uid()))
    )
  );
create policy actions_select_admin
  on public.approval_actions for select to authenticated
  using (public.is_admin());
-- NO insert/update/delete policies: history is immutable to every role.

-- gate_passes: student own; hod in department; admin; security = function-only --
create policy passes_select_student_own
  on public.gate_passes for select to authenticated
  using (
    public.get_user_role((select auth.uid())) = 'student'
    and exists (
      select 1 from public.gate_pass_applications a
      where a.id = application_id
        and a.student_id = (select auth.uid())
    )
  );
create policy passes_select_hod
  on public.gate_passes for select to authenticated
  using (
    public.get_user_role((select auth.uid())) = 'hod'
    and exists (
      select 1 from public.gate_pass_applications a
      where a.id = application_id
        and a.department_id = public.get_user_department((select auth.uid()))
    )
  );
create policy passes_select_admin
  on public.gate_passes for select to authenticated
  using (public.is_admin());

-- gate_verification_logs: admin-only reads; security appends via fn_gate_record
create policy verification_logs_select_admin
  on public.gate_verification_logs for select to authenticated
  using (public.is_admin());

-- notifications: student own; read_at is the single client-write surface --------
create policy notifications_select_own
  on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy notifications_update_own
  on public.notifications for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
-- table grant already narrowed to UPDATE (read_at) in 0003; no insert/delete.

-- audit_logs: admin-only reads; appends via functions/triggers ------------------
create policy audit_logs_select_admin
  on public.audit_logs for select to authenticated
  using (public.is_admin());

-- approval_rules: config readable/administered only by admins -------------------
create policy approval_rules_select_admin
  on public.approval_rules for select to authenticated
  using (public.is_admin());
