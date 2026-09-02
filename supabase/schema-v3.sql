-- =========================================================
-- MG Kingdom Queue — v3 schema additions
-- Run AFTER schema.sql, schema-requests.sql, seed-employees.sql,
-- schema-v2.sql, seed-app-users.sql.
-- =========================================================

create extension if not exists "pgcrypto";

-- ---------- REQUEST TYPE LINES ----------
-- A request can now carry BOTH Approval and Delegation at once, each
-- tracked as its own independent thread: own status, own assignee,
-- own chat history (via request_audit_log.type_line_id below) — the
-- same "several independent lines per WIP" pattern already used for
-- payment types.
create table if not exists request_type_lines (
    id            uuid primary key default gen_random_uuid(),
    request_id    uuid not null references requests(id) on delete cascade,
    request_type  text not null check (request_type in ('approval','delegation')),
    status        text not null default 'open' check (status in ('open','approved','rejected','returned')),
    assignee_id   uuid references employees(id),
    assignee_name text,
    created_at    timestamptz not null default now(),
    unique (request_id, request_type)
);

alter table request_type_lines enable row level security;
drop policy if exists "public read type lines" on request_type_lines;
create policy "public read type lines" on request_type_lines for select using (true);
drop policy if exists "public insert type lines" on request_type_lines;
create policy "public insert type lines" on request_type_lines for insert with check (true);
drop policy if exists "public update type lines" on request_type_lines;
create policy "public update type lines" on request_type_lines for update using (true);

-- ---------- PAYMENT LINES: independent assignee per line ----------
-- "Assign one person for each payment type when a WIP has more than one."
alter table request_payment_lines add column if not exists assignee_id uuid references employees(id);
alter table request_payment_lines add column if not exists assignee_name text;

-- ---------- AUDIT LOG: tag entries to a specific type-line thread ----------
-- NULL type_line_id = general/shared timeline (creation, overall
-- reassignment, payment-line actions). A populated type_line_id means
-- that entry belongs to that Approval or Delegation thread's own chat.
alter table request_audit_log add column if not exists type_line_id uuid references request_type_lines(id) on delete cascade;
create index if not exists idx_audit_type_line on request_audit_log(type_line_id, created_at);

-- ---------- REALTIME ----------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'request_type_lines'
  ) then
    alter publication supabase_realtime add table request_type_lines;
  end if;
end $$;
