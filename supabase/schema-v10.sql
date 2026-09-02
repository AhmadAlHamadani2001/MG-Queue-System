-- =========================================================
-- MG Kingdom Queue — v10 schema additions
-- Run AFTER schema-v9.sql.
-- =========================================================

-- Head Office is not a service branch — it shouldn't have a customer
-- queue or appear as a branch dashboard.
delete from branches where code = 'JED-HQ';

-- Anyone whose employee record says "Head Office" shouldn't be routed
-- to a branch dashboard on login — they land on the Kingdom overview
-- instead (handled in app code).
update app_users set demo_branch_code = null where employee_branch = 'Head Office';

-- ---------- Admin branch management (add, edit, delete) ----------
-- branches previously only had a read policy.
drop policy if exists "public insert branches" on branches;
create policy "public insert branches" on branches for insert with check (true);
drop policy if exists "public update branches" on branches;
create policy "public update branches" on branches for update using (true);
drop policy if exists "public delete branches" on branches;
create policy "public delete branches" on branches for delete using (true);

-- ---------- Admin user management (add, delete) ----------
-- app_users previously had read + update only (accounts were meant to
-- be provisioned by the seed script only). Admin can now add/remove
-- accounts directly from the UI too.
drop policy if exists "public insert app_users" on app_users;
create policy "public insert app_users" on app_users for insert with check (true);
drop policy if exists "public delete app_users" on app_users;
create policy "public delete app_users" on app_users for delete using (true);
