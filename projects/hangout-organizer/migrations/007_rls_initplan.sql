-- ---------------------------------------------------------------------------
-- 007: evaluate is_host() once per query instead of once per row.
--
-- The policies created in 001, 003 and 005 read `using (public.is_host())`.
-- is_host() is marked STABLE, but a bare function call in an RLS predicate is
-- still re-evaluated for every row the planner examines — and each evaluation
-- parses the JWT via auth.jwt() and probes host_allowlist. Reading a poll's
-- availability therefore paid that cost once per availability row.
--
-- Wrapping the call in a scalar subquery, `(select public.is_host())`, makes
-- Postgres hoist it into an InitPlan: evaluated once, then compared as a
-- constant. This is the standard fix for the pattern and it changes only when
-- the check runs, never what it decides — the same function, the same
-- host_allowlist lookup, the same answer.
--
-- SECURITY: identical semantics. Every table keeps `for all to authenticated`
-- with both USING and WITH CHECK, so the host gate is unchanged. Any table not
-- listed here keeps whatever policy it has; a table with RLS on and no policy
-- stays closed, which fails safe.
--
-- Idempotent: safe to re-run.
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    -- 001
    'sports','venues','people','sessions','availability','session_responses',
    'attendees','events','event_tasks','checklist_templates','checklist_template_items',
    -- 003
    'roster_groups','roster_group_members','polls','poll_invitees','poll_responses',
    -- 005
    'session_optouts'
  ] loop
    if to_regclass(format('public.%I', t)) is null then
      continue;
    end if;
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists host_all on %I', t);
    execute format(
      'create policy host_all on %I for all to authenticated '
      'using ((select public.is_host())) with check ((select public.is_host()))', t);
  end loop;
end $$;

-- No new indexes here on purpose. Every query this app runs filters on a
-- leading key column that is already indexed: poll_invitees, poll_responses,
-- attendees and session_optouts are all keyed on the column they are filtered
-- by, and availability has (poll_id, slot_start). The RLS predicate was the
-- per-row cost, not a missing index.
