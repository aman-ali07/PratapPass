-- 0009_profiles_staff_student_read.sql -------------------------------------------
-- T-08: the profiles read slice planned in DATABASE.md §2 — "faculty/hod select
-- same-department students (queue context, planned 0003/0004)" — planned in text
-- but never authored: 0003/0004 shipped without it. Reviewers need the applicant
-- identity (name/roll) in the queue; scope stays department-pinned and
-- STUDENT-rows-only, so staff profiles (including admins) remain self/admin-only
-- and gate security still gains no profile read (verify function returns a
-- minimal view). D-014's write-scope column grants are untouched (this is a
-- SELECT-only addition).

create policy profiles_select_department_staff
  on public.profiles for select to authenticated
  using (
    public.get_user_role((select auth.uid())) in ('faculty', 'hod')
    and role = 'student'
    and department_id = public.get_user_department((select auth.uid()))
  );
