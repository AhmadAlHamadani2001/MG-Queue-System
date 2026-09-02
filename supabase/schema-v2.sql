-- =========================================================
-- MG Kingdom Queue — v2 schema additions
-- Run AFTER schema.sql, schema-requests.sql and seed-employees.sql.
-- =========================================================

create extension if not exists "pgcrypto";

-- ---------- LOGIN ACCOUNTS ----------
-- NOTE: passwords are stored in PLAIN TEXT by design, because the
-- requirement is "admins should see the passwords and change them."
-- This is intentionally not production-grade security — it's an
-- internal-tool-style login, not Supabase Auth. Do not reuse these
-- passwords anywhere real, and treat this table as sensitive.
create table if not exists app_users (
    id                  uuid primary key default gen_random_uuid(),
    name                text not null,
    email               text not null unique,
    password            text not null,
    role                text not null default 'staff' check (role in ('admin','manager','advisor','staff')),
    employee_branch     text,          -- raw branch name from Employees.xlsx (e.g. "Hiraa")
    demo_branch_code    text,          -- which of our 3 seeded branches this maps to, if any
    title               text,
    created_at          timestamptz not null default now()
);

alter table app_users enable row level security;
drop policy if exists "public read app_users" on app_users;
create policy "public read app_users" on app_users for select using (true);
drop policy if exists "public update app_users" on app_users;
create policy "public update app_users" on app_users for update using (true);
-- No public insert policy — accounts are provisioned via the seed script only.

-- ---------- BRANCH → EMPLOYEE-BRANCH MAPPING ----------
alter table branches add column if not exists employee_branch text;

update branches set employee_branch = 'Hiraa'     where code = 'JED-01';
update branches set employee_branch = 'North'     where code = 'RUH-01';
update branches set employee_branch = 'Khaldiah'  where code = 'DMM-01';

-- ---------- REQUESTS: approval workflow + lock ----------
alter table requests drop constraint if exists requests_status_check;
alter table requests add constraint requests_status_check
    check (status in ('open','in_progress','closed','approved','rejected','returned'));

alter table requests add column if not exists locked boolean not null default false;

-- ---------- PAYMENT LINES (a WIP/request can have several, tracked independently) ----------
create table if not exists request_payment_lines (
    id            uuid primary key default gen_random_uuid(),
    request_id    uuid not null references requests(id) on delete cascade,
    payment_type  text not null check (payment_type in ('cash','warranty','internal')),
    status        text not null default 'open' check (status in ('open','closed')),
    closed_by     text,
    closed_at     timestamptz,
    created_at    timestamptz not null default now(),
    unique (request_id, payment_type)
);

alter table request_payment_lines enable row level security;
drop policy if exists "public read payment lines" on request_payment_lines;
create policy "public read payment lines" on request_payment_lines for select using (true);
drop policy if exists "public insert payment lines" on request_payment_lines;
create policy "public insert payment lines" on request_payment_lines for insert with check (true);
drop policy if exists "public update payment lines" on request_payment_lines;
create policy "public update payment lines" on request_payment_lines for update using (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'request_payment_lines'
  ) then
    alter publication supabase_realtime add table request_payment_lines;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'app_users'
  ) then
    alter publication supabase_realtime add table app_users;
  end if;
end $$;
