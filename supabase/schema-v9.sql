-- =========================================================
-- MG Kingdom Queue — v9 schema additions
-- Run AFTER schema-v8.sql.
-- =========================================================

-- employees had a read policy but no update policy at all, so the
-- admin "edit team member" feature would fail silently under RLS.
-- Same demo-permissive model as the rest of this app (anon key has no
-- per-request identity since there's no Supabase Auth here — admin
-- gating happens client-side, same as app_users elsewhere).
drop policy if exists "public update employees" on employees;
create policy "public update employees" on employees for update using (true);
