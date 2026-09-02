-- =========================================================
-- MG Kingdom Queue — Request Management module
-- Run this AFTER schema.sql (and after seed-employees.sql
-- for the employee directory used by the Assignee autocomplete).
-- =========================================================

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- ---------- EMPLOYEES (directory used for Assignee autocomplete) ----------
create table if not exists employees (
    id          uuid primary key default gen_random_uuid(),
    name        text not null,
    title       text,
    city        text,
    branch      text,
    phone       text,
    email       text,
    created_at  timestamptz not null default now()
);

create index if not exists idx_employees_name_trgm on employees using gin (name gin_trgm_ops);

-- ---------- REQUESTS ----------
create table if not exists requests (
    id              uuid primary key default gen_random_uuid(),
    wip_number      text not null,
    remarks         text not null,
    request_type    text check (request_type in ('approval','delegation')),
    payment_type    text check (payment_type in ('cash','warranty','internal')),
    assignee_id     uuid references employees(id),
    assignee_name   text,
    status          text not null default 'open' check (status in ('open','in_progress','closed')),
    created_by      text not null,
    created_at      timestamptz not null default now(),
    closed_at       timestamptz
);

create index if not exists idx_requests_wip_number on requests(wip_number);
create index if not exists idx_requests_assignee on requests(assignee_name, status);
create index if not exists idx_requests_status on requests(status);

-- ---------- AUDIT TRAIL (immutable — no update/delete policy given) ----------
create table if not exists request_audit_log (
    id            bigserial primary key,
    request_id    uuid not null references requests(id) on delete cascade,
    action        text not null,        -- 'created' | 'status_changed' | 'reassigned' | 'remark_added'
    actor_name    text not null,
    remarks       text,
    created_at    timestamptz not null default now()
);

create index if not exists idx_audit_request on request_audit_log(request_id, created_at);

-- ---------- ROW LEVEL SECURITY ----------
-- Demo-permissive, same caveat as schema.sql: tighten with Supabase
-- Auth before production. Audit log intentionally has NO update/delete
-- policy at all — rows are insert + select only, making it immutable
-- even under these permissive settings.
alter table employees enable row level security;
alter table requests enable row level security;
alter table request_audit_log enable row level security;

drop policy if exists "public read employees" on employees;
create policy "public read employees" on employees for select using (true);

drop policy if exists "public read requests" on requests;
create policy "public read requests" on requests for select using (true);
drop policy if exists "public insert requests" on requests;
create policy "public insert requests" on requests for insert with check (true);
drop policy if exists "public update requests" on requests;
create policy "public update requests" on requests for update using (true);

drop policy if exists "public read audit" on request_audit_log;
create policy "public read audit" on request_audit_log for select using (true);
drop policy if exists "public insert audit" on request_audit_log;
create policy "public insert audit" on request_audit_log for insert with check (true);
-- no update/delete policy on request_audit_log — rows are append-only.

-- ---------- REALTIME ----------
alter publication supabase_realtime add table requests;
alter publication supabase_realtime add table request_audit_log;
