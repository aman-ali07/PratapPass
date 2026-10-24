-- 0016_admin_analytics.sql ------------------------------------------------------
-- T-13: read-only admin analytics and the audit viewer.
--
-- Aggregation cannot go through PostgREST (no GROUP BY), and `audit_logs` rows
-- are only readable by admins under RLS. These functions are therefore the
-- read path: SECURITY DEFINER, `is_admin() is not true` fails closed, EXECUTE
-- revoked from anon/public, no writes at all (no audit rows for reads — the
-- analytics page is not an event, and the audit log records mutations/access,
-- not dashboard views).
--
-- Metric definitions (documented so the numbers reconcile):
--   pending  = submitted + under_review + additional_info_required
--   approved = approved + completed        (completed = returned after exit)
--   rejected = rejected
--   approval rate = approved / (approved + rejected) * 100, null when no
--                   decision exists yet (never a misleading 0%)
--   processing time = decided_at - submitted_at for decided applications
--                     (wall clock, so an info request pause is included)
--   overdue = still pending AND expected_return_at < now()
--             (the trip window closed without a decision)

-- fn_admin_analytics -----------------------------------------------------------
create or replace function public.fn_admin_analytics()
returns table (
  total_count            bigint,
  pending_count          bigint,
  approved_count         bigint,
  rejected_count         bigint,
  approval_rate          numeric,
  avg_processing_seconds numeric,
  overdue_count          bigint
)
language plpgsql stable security definer
set search_path = public
as $$
begin
  if public.is_admin() is not true then
    raise exception 'Only administrators may view analytics' using errcode = 'P0001';
  end if;

  return query
  select
    count(*)::bigint,
    count(*) filter (
      where a.status in ('submitted', 'under_review', 'additional_info_required')
    )::bigint,
    count(*) filter (where a.status in ('approved', 'completed'))::bigint,
    count(*) filter (where a.status = 'rejected')::bigint,
    round(
      100.0 * count(*) filter (where a.status in ('approved', 'completed'))
        / nullif(count(*) filter (where a.status in ('approved', 'completed', 'rejected')), 0),
      1
    ),
    round(
      avg(extract(epoch from (a.decided_at - a.submitted_at)))
        filter (where a.decided_at is not null),
      0
    ),
    count(*) filter (
      where a.status in ('submitted', 'under_review', 'additional_info_required')
        and a.expected_return_at < now()
    )::bigint
  from public.gate_pass_applications a;
end;
$$;

revoke execute on function public.fn_admin_analytics() from anon, public;
grant execute on function public.fn_admin_analytics() to authenticated;

-- fn_admin_analytics_breakdown -------------------------------------------------
-- One function, two dimensions: `reason` rows then `department` rows. The UI
-- renders them as two tables; keeping them together avoids a second round trip
-- and guarantees both use the same status buckets as the KPI row above.
create or replace function public.fn_admin_analytics_breakdown()
returns table (
  dimension              text,
  key                    text,
  label                  text,
  total_count            bigint,
  pending_count          bigint,
  approved_count         bigint,
  rejected_count         bigint,
  avg_processing_seconds numeric
)
language plpgsql stable security definer
set search_path = public
as $$
begin
  if public.is_admin() is not true then
    raise exception 'Only administrators may view analytics' using errcode = 'P0001';
  end if;

  return query
  select
    'reason'::text,
    a.reason::text,
    initcap(a.reason::text),
    count(*)::bigint,
    count(*) filter (
      where a.status in ('submitted', 'under_review', 'additional_info_required')
    )::bigint,
    count(*) filter (where a.status in ('approved', 'completed'))::bigint,
    count(*) filter (where a.status = 'rejected')::bigint,
    round(
      avg(extract(epoch from (a.decided_at - a.submitted_at)))
        filter (where a.decided_at is not null),
      0
    )
  from public.gate_pass_applications a
  group by a.reason
  order by count(*) desc, a.reason;

  return query
  select
    'department'::text,
    d.code,
    d.name,
    count(*)::bigint,
    count(*) filter (
      where a.status in ('submitted', 'under_review', 'additional_info_required')
    )::bigint,
    count(*) filter (where a.status in ('approved', 'completed'))::bigint,
    count(*) filter (where a.status = 'rejected')::bigint,
    round(
      avg(extract(epoch from (a.decided_at - a.submitted_at)))
        filter (where a.decided_at is not null),
      0
    )
  from public.gate_pass_applications a
  join public.departments d on d.id = a.department_id
  group by d.id, d.code, d.name
  order by count(*) desc, d.code;
end;
$$;

revoke execute on function public.fn_admin_analytics_breakdown() from anon, public;
grant execute on function public.fn_admin_analytics_breakdown() to authenticated;

-- fn_admin_list_audit ----------------------------------------------------------
-- Filters: actor (or system-only), action PREFIX (literal — `%`/`_` are not
-- wildcards), and an inclusive created_at range. Pagination is newest-first
-- with `(created_at, id)` as the stable key; `total_count` is the filtered
-- count for the "showing X of N" line.
create or replace function public.fn_admin_list_audit(
  p_actor_id     uuid        default null,
  p_system_actor boolean     default false,
  p_action       text        default null,
  p_from         timestamptz default null,
  p_to           timestamptz default null,
  p_limit        int         default 50,
  p_offset       int         default 0
) returns table (
  id          uuid,
  actor_id    uuid,
  actor_name  text,
  actor_role  public.user_role,
  action      text,
  entity_type text,
  entity_id   uuid,
  metadata    jsonb,
  created_at  timestamptz,
  total_count bigint
)
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_limit  int := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
begin
  if public.is_admin() is not true then
    raise exception 'Only administrators may view the audit log' using errcode = 'P0001';
  end if;

  return query
  select
    a.id,
    a.actor_id,
    coalesce(p.full_name, 'System'),
    p.role,
    a.action,
    a.entity_type,
    a.entity_id,
    a.metadata,
    a.created_at,
    count(*) over ()::bigint
  from public.audit_logs a
  left join public.profiles p on p.id = a.actor_id
  where
    case
      when p_system_actor then a.actor_id is null
      when p_actor_id is not null then a.actor_id = p_actor_id
      else true
    end
    and (
      p_action is null
      or left(a.action, char_length(p_action)) = p_action
    )
    and (p_from is null or a.created_at >= p_from)
    and (p_to is null or a.created_at <= p_to)
  order by a.created_at desc, a.id desc
  limit v_limit offset v_offset;
end;
$$;

revoke execute on function public.fn_admin_list_audit(
  uuid, boolean, text, timestamptz, timestamptz, int, int
) from anon, public;
grant execute on function public.fn_admin_list_audit(
  uuid, boolean, text, timestamptz, timestamptz, int, int
) to authenticated;

-- fn_admin_audit_actors --------------------------------------------------------
-- The actor filter options: only identities that actually appear in the log,
-- plus the system pseudo-actor (NULL) so trigger-written rows stay reachable.
create or replace function public.fn_admin_audit_actors()
returns table (
  actor_id    uuid,
  actor_name  text,
  actor_role  public.user_role,
  entry_count bigint
)
language plpgsql stable security definer
set search_path = public
as $$
begin
  if public.is_admin() is not true then
    raise exception 'Only administrators may view the audit log' using errcode = 'P0001';
  end if;

  return query
  select
    a.actor_id,
    coalesce(p.full_name, 'System'),
    p.role,
    count(*)::bigint
  from public.audit_logs a
  left join public.profiles p on p.id = a.actor_id
  group by a.actor_id, p.full_name, p.role
  order by (a.actor_id is null), count(*) desc, coalesce(p.full_name, 'System');
end;
$$;

revoke execute on function public.fn_admin_audit_actors() from anon, public;
grant execute on function public.fn_admin_audit_actors() to authenticated;
