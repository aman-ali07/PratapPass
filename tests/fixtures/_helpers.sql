-- Shared assertion helpers for the transactional SQL fixtures.
-- Created in pg_temp so nothing survives the fixture's ROLLBACK.
create function pg_temp.expect_eq(actual text, expected text, label text) returns void
language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'ASSERT FAILED [%]: expected %, got %', label, expected, actual;
  end if;
end $$;

create function pg_temp.expect_error(stmt text, pattern text, label text) returns void
language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    if sqlerrm like pattern then
      return;
    end if;
    raise exception 'ASSERT FAILED [%]: expected error like %, got: %', label, pattern, sqlerrm;
  end;
  raise exception 'ASSERT FAILED [%]: expected error like %, but the statement succeeded',
    label, pattern;
end $$;
