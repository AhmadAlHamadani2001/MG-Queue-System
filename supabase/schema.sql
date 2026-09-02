-- =========================================================
-- MG Kingdom Queue — Supabase schema (MVP)
-- Run this once in Supabase Studio → SQL Editor → New query
-- =========================================================

create extension if not exists "pgcrypto";

-- ---------- BRANCHES ----------
create table if not exists branches (
    id          uuid primary key default gen_random_uuid(),
    code        text unique not null,
    name_en     text not null,
    name_ar     text not null,
    status      text not null default 'open' check (status in ('open','paused','closed')),
    created_at  timestamptz not null default now()
);

-- ---------- QUEUE TICKETS ----------
create table if not exists queue_tickets (
    id                  uuid primary key default gen_random_uuid(),
    branch_id           uuid not null references branches(id),
    ticket_number       text,
    customer_name       text not null,
    mobile              text not null,
    service_mode        text not null check (service_mode in ('appointment','walk_in')),
    wip_service_type    text check (wip_service_type in ('general_repair','quick_service','vehicle_delivery')),
    wip_number          text,
    status              text not null default 'waiting'
                          check (status in ('waiting','called','in_service','completed','no_show','cancelled')),
    advisor_name        text,
    queue_entry_at      timestamptz not null default now(),
    served_at           timestamptz,
    closed_at           timestamptz,
    created_at          timestamptz not null default now()
);

create index if not exists idx_tickets_branch_status on queue_tickets(branch_id, status);
create index if not exists idx_tickets_branch_day on queue_tickets(branch_id, queue_entry_at);

-- ---------- AUTO TICKET NUMBER (per branch, per day) ----------
create or replace function set_ticket_number()
returns trigger as $$
declare
  seq int;
begin
  select count(*) + 1 into seq
  from queue_tickets
  where branch_id = new.branch_id
    and queue_entry_at::date = now()::date;
  new.ticket_number := 'A-' || lpad(seq::text, 3, '0');
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_set_ticket_number on queue_tickets;
create trigger trg_set_ticket_number
before insert on queue_tickets
for each row execute function set_ticket_number();

-- ---------- ROW LEVEL SECURITY ----------
-- NOTE: these are DEMO-PERMISSIVE policies so the app works with
-- just the public anon key and no login screen. Before going to
-- production, replace the "update"/"insert" policies with ones
-- scoped to an authenticated advisor's branch_id (see README).
alter table branches enable row level security;
alter table queue_tickets enable row level security;

drop policy if exists "public read branches" on branches;
create policy "public read branches" on branches for select using (true);

drop policy if exists "public read tickets" on queue_tickets;
create policy "public read tickets" on queue_tickets for select using (true);

drop policy if exists "public insert tickets" on queue_tickets;
create policy "public insert tickets" on queue_tickets for insert with check (true);

drop policy if exists "public update tickets" on queue_tickets;
create policy "public update tickets" on queue_tickets for update using (true);

-- ---------- REALTIME ----------
-- Adds queue_tickets to Supabase's realtime publication so the
-- customer/advisor/HQ pages get postgres_changes events.
alter publication supabase_realtime add table queue_tickets;

-- ---------- SEED DATA ----------
insert into branches (code, name_en, name_ar, status)
values
  ('JED-01', 'Jeddah — Tahlia', 'جدة – التحلية', 'open'),
  ('RUH-01', 'Riyadh — Olaya', 'الرياض – العليا', 'open'),
  ('DMM-01', 'Dammam — Corniche', 'الدمام – الكورنيش', 'open')
on conflict (code) do nothing;
